/**
 * ConfirmItem — review and confirm a piece's tags.
 *
 * Re-fetches the item from `GET /api/items` (so it always shows the server's
 * cutout + current tags, whether we just processed it or resumed later), shows
 * the cutout large on a cream surface Card, and offers one editable chip per
 * field. Tapping a chip opens an inline option row: category / pattern /
 * colorPrimary are fixed choice chips; name / brand are inline text inputs.
 * Confirming PATCHes only the changed fields with `confirm: true`, fires the
 * light-impact save haptic (the save moment), and hands control back to the flow.
 *
 * Heading follows the processing result: `processedTitle` when vision landed
 * tags, `manualTitle` otherwise. On a resume (no result in hand) we infer it
 * from whether the row already carries AI-derived tags.
 *
 * Load or save failures show the honest `addFailed` line with a retry that
 * re-runs the failed step — never blaming the user for the photo.
 */
import { strings } from '@era/core/strings';
import { layout, radii, rnShadow, spacing } from '@era/tokens';
import * as Haptics from 'expo-haptics';
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { Input } from '@/components/Input';
import { Text } from '@/components/Text';
import { useTheme } from '@/lib/theme';

import { fetchItems, patchItem, type ItemUpdates, type ItemWithDisplay } from './api';
import { CATEGORIES, COLOR_WORDS, PATTERNS } from './constants';

/** The single-value fields the confirm editor exposes, in display order. */
type FieldKey = 'category' | 'colorPrimary' | 'pattern' | 'name' | 'brand';

/** Which inline editor is open — a single-value field, or the colors panel. */
type OpenKey = FieldKey | 'colors';

/** The editable slice of an item's single-value tags, all optional strings. */
type Draft = Record<FieldKey, string>;

interface ConfirmItemProps {
  readonly itemId: string;
  /**
   * Whether vision tagging succeeded — picks the heading. Omit on a resume and
   * the heading is inferred from the item's existing tags.
   */
  readonly vision?: boolean;
  /** Called after a successful confirm+save. */
  readonly onSaved: () => void;
}

export function ConfirmItem({ itemId, vision, onSaved }: ConfirmItemProps) {
  const { colors, resolved } = useTheme();
  const [item, setItem] = useState<ItemWithDisplay | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  // colors is a multi-select array, kept apart from the single-value string draft.
  const [colorsDraft, setColorsDraft] = useState<string[]>([]);
  // Fields the user has actively set — so placeholder category/name read as unset
  // until touched when vision failed (M2).
  const [touched, setTouched] = useState<ReadonlySet<FieldKey>>(() => new Set());
  const [active, setActive] = useState<OpenKey | null>(null);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const items = await fetchItems();
      const row = items.find((candidate) => candidate.id === itemId) ?? null;
      if (!row) {
        setFailed(true);
        return;
      }
      setItem(row);
      setDraft(draftFrom(row));
      setColorsDraft(row.colors ? [...row.colors] : []);
    } catch {
      setFailed(true);
    }
  }, [itemId]);

  const toggleColorWord = useCallback((word: string) => {
    setColorsDraft((prev) => (prev.includes(word) ? prev.filter((c) => c !== word) : [...prev, word]));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(async () => {
    if (!item || !draft) return;
    setSaving(true);
    setFailed(false);
    try {
      const updates = changedUpdates(item, draft);
      // colors lives outside the string draft; diff it separately. [] and null
      // are equivalent "empty", so neither sends a spurious correction.
      if (JSON.stringify(item.colors ?? []) !== JSON.stringify(colorsDraft)) {
        updates.colors = colorsDraft;
      }
      await patchItem(item.id, { updates, confirm: true });
      // The save moment — a small warmth, the same the outfit-save gets later.
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onSaved();
    } catch {
      setFailed(true);
      setSaving(false);
    }
  }, [item, draft, colorsDraft, onSaved]);

  const headingIsProcessed = useMemo(
    () => (vision ?? (item ? inferVision(item) : false)),
    [vision, item],
  );

  if (failed) {
    return (
      <FailureNotice
        onRetry={() => {
          if (item) {
            void save();
          } else {
            void load();
          }
        }}
      />
    );
  }

  if (!item || !draft) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.text} />
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.hero, rnShadow('e2', resolved), { backgroundColor: colors.surface, borderColor: colors.hairline }]}>
        {item.displayUrl ? (
          <Image
            source={{ uri: item.displayUrl }}
            style={styles.heroImage}
            resizeMode="contain"
            accessibilityLabel={item.name}
          />
        ) : (
          <View style={styles.heroImage} />
        )}
      </View>

      <Text accessibilityRole="header" variant="title" size="title2" color={colors.text}>
        {headingIsProcessed ? strings.closet.processedTitle : strings.closet.manualTitle}
      </Text>

      <View style={styles.fields}>
        {FIELDS.map((field) => (
          <Fragment key={field}>
            <FieldEditor
              field={field}
              value={draft[field]}
              open={active === field}
              forceGhost={
                (field === 'category' || field === 'name') && !headingIsProcessed && !touched.has(field)
              }
              onToggle={() => setActive((current) => (current === field ? null : field))}
              onChange={(next) => {
                setDraft((current) => (current ? { ...current, [field]: next } : current));
                setTouched((prev) => (prev.has(field) ? prev : new Set(prev).add(field)));
                if (field !== 'name' && field !== 'brand') {
                  setActive(null);
                }
              }}
            />
            {/* colors sits next to Main color; multi-select, panel stays open. */}
            {field === 'colorPrimary' ? (
              <ColorsField
                selected={colorsDraft}
                open={active === 'colors'}
                onToggle={() => setActive((current) => (current === 'colors' ? null : 'colors'))}
                onToggleColor={toggleColorWord}
              />
            ) : null}
          </Fragment>
        ))}
      </View>

      <Button
        label={strings.closet.confirmCta}
        onPress={save}
        disabled={saving || (!headingIsProcessed && !touched.has('category'))}
        style={styles.confirm}
      />
    </ScrollView>
  );
}

/** The fields in display order — choice fields first, free text last. */
const FIELDS: readonly FieldKey[] = ['category', 'colorPrimary', 'pattern', 'name', 'brand'];

/** Which fields are single-select chip rows (the rest are text inputs). */
const CHOICES: Partial<Record<FieldKey, readonly string[]>> = {
  category: CATEGORIES,
  colorPrimary: COLOR_WORDS,
  pattern: PATTERNS,
};

interface FieldEditorProps {
  readonly field: FieldKey;
  readonly value: string;
  readonly open: boolean;
  /** Force the unset/ghost display even when a (placeholder) value is present. */
  readonly forceGhost?: boolean;
  readonly onToggle: () => void;
  readonly onChange: (next: string) => void;
}

/** One field: a trigger chip showing the value, plus an inline editor when open. */
function FieldEditor({ field, value, open, forceGhost = false, onToggle, onChange }: FieldEditorProps) {
  const label = strings.closet.fieldLabels[field];
  const options = CHOICES[field];
  const display =
    value && !forceGhost ? `${label}: ${titleCase(value)}` : strings.closet.fieldUnset(label);

  return (
    <View style={styles.field}>
      <Chip label={display} selected={open} onToggle={onToggle} />
      {open ? (
        options ? (
          <View style={styles.options}>
            {options.map((option) => (
              <Chip
                key={option}
                label={titleCase(option)}
                selected={value === option}
                onToggle={() => onChange(option)}
              />
            ))}
          </View>
        ) : (
          <Input
            value={value}
            onChangeText={onChange}
            placeholder={strings.closet.fieldUnset(label)}
            autoCapitalize="words"
            containerStyle={styles.input}
          />
        )
      ) : null}
    </View>
  );
}

interface ColorsFieldProps {
  readonly selected: readonly string[];
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly onToggleColor: (word: string) => void;
}

/** The colors multi-select: a trigger chip, then a COLOR_WORDS toggle panel that
 * stays open so several colours can be chosen (mirrors the web confirm screen). */
function ColorsField({ selected, open, onToggle, onToggleColor }: ColorsFieldProps) {
  const label = strings.closet.fieldLabels.colors;
  const display =
    selected.length > 0
      ? `${label}: ${selected.map(titleCase).join(', ')}`
      : strings.closet.fieldUnset(label);

  return (
    <View style={styles.field}>
      <Chip label={display} selected={open} onToggle={onToggle} />
      {open ? (
        <View style={styles.options}>
          {COLOR_WORDS.map((word) => (
            <Chip
              key={word}
              label={titleCase(word)}
              selected={selected.includes(word)}
              onToggle={() => onToggleColor(word)}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** The honest failure line with a retry that re-runs the failed step. */
function FailureNotice({ onRetry }: { readonly onRetry: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={styles.centered}>
      <Text variant="body" color={colors.text} style={{ textAlign: 'center' }}>
        {strings.closet.addFailed}
      </Text>
      <Button label={strings.closet.retryCta} variant="secondary" onPress={onRetry} />
    </View>
  );
}

/** Seed the editable draft from an item, nulls flattened to empty strings. */
function draftFrom(item: ItemWithDisplay): Draft {
  return {
    category: item.category,
    colorPrimary: item.colorPrimary ?? '',
    pattern: item.pattern ?? '',
    name: item.name,
    brand: item.brand ?? '',
  };
}

/** Build a changed-only update payload by diffing the draft against the item. */
function changedUpdates(item: ItemWithDisplay, draft: Draft): ItemUpdates {
  const original = draftFrom(item);
  const updates: Record<string, string> = {};
  for (const field of FIELDS) {
    if (draft[field] !== original[field]) {
      updates[field] = draft[field];
    }
  }
  return updates as ItemUpdates;
}

/** On a resume we lack the process result — infer vision from existing tags. */
function inferVision(item: ItemWithDisplay): boolean {
  return Boolean(item.colorPrimary || item.pattern || item.brand);
}

/** Capitalize the first letter for display; values are stored lowercased. */
function titleCase(value: string): string {
  return value.length > 0 ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.s6,
    gap: spacing.s6,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s4,
    padding: spacing.s6,
  },
  hero: {
    borderRadius: radii.hero,
    borderWidth: StyleSheet.hairlineWidth,
    borderCurve: 'continuous',
    padding: spacing.s4,
    alignItems: 'center',
  },
  heroImage: {
    width: '100%',
    aspectRatio: layout.itemCard.ratio,
  },
  fields: {
    gap: spacing.s3,
  },
  field: {
    gap: spacing.s2,
  },
  options: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.s2,
  },
  input: {
    alignSelf: 'stretch',
  },
  confirm: {
    marginTop: spacing.s2,
  },
});
