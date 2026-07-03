/**
 * ItemEditor — the compact in-closet tag editor (mobile).
 *
 * The closet counterpart to the add-flow ConfirmItem: the same tap-chip →
 * inline-options → set interaction and the same field primitives (Chip, Input,
 * the CATEGORIES / COLOR_WORDS / PATTERNS vocabularies), but scoped to editing a
 * piece already in the closet. No processing heading, no hero image — six
 * pre-filled fields (category, name, brand, main colour, colours, pattern), a
 * Save that emits only the fields the user actually changed (the sheet PATCHes
 * `{ updates }`, never `confirm`), and a Cancel back to the detail view. Mirrors
 * apps/web's ItemEditor; the chips carry their own selection haptic.
 */
import { strings } from '@era/core/strings';
import { spacing } from '@era/tokens';
import { Fragment, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { Input } from '@/components/Input';
import type { ItemUpdates, ItemWithDisplay } from '@/components/items';

import {
  CATEGORIES,
  COLOR_WORDS,
  PATTERNS,
  type ItemCategory,
  type ItemPattern,
} from '../items/constants';

/** The single-value fields the editor exposes as chips or text inputs. */
type SingleField = 'category' | 'name' | 'brand' | 'colorPrimary' | 'pattern';
/** Which inline editor is open — a single-value field, or the colours panel. */
type OpenKey = SingleField | 'colors';

/** Single-value fields in display order; `colors` is injected after the main colour. */
const FIELDS: readonly SingleField[] = ['category', 'name', 'brand', 'colorPrimary', 'pattern'];

/** Which single-value fields are choice-chip rows (the rest are text inputs). */
const CHOICES: Partial<Record<SingleField, readonly string[]>> = {
  category: CATEGORIES,
  colorPrimary: COLOR_WORDS,
  pattern: PATTERNS,
};

interface ItemEditorProps {
  readonly item: ItemWithDisplay;
  /** True while the sheet's PATCH is in flight — disables Save. */
  readonly busy: boolean;
  /** Fires with the changed-only updates when the user saves. */
  readonly onSave: (updates: ItemUpdates) => void;
  /** Dismiss the editor without saving, back to the detail view. */
  readonly onCancel: () => void;
}

export function ItemEditor({ item, busy, onSave, onCancel }: ItemEditorProps) {
  // Accumulated edits — a local change wins over the item's stored value, and
  // this doubles as the changed-only payload (empty until a field is touched).
  const [edits, setEdits] = useState<ItemUpdates>({});
  const [active, setActive] = useState<OpenKey | null>(null);

  const labels = strings.closet.fieldLabels;

  // Merged current values: a local edit wins over the item's stored value.
  const merged: Record<SingleField, string> = {
    category: edits.category ?? item.category,
    name: edits.name ?? item.name,
    brand: edits.brand ?? item.brand ?? '',
    colorPrimary: edits.colorPrimary ?? item.colorPrimary ?? '',
    pattern: edits.pattern ?? item.pattern ?? '',
  };
  const colors = edits.colors ?? (item.colors ? [...item.colors] : []);

  function setField(field: SingleField, value: string) {
    // The chip options are drawn from the enum tuples, so the narrowing casts are
    // sound; name / brand / colorPrimary are already plain strings on ItemUpdates.
    switch (field) {
      case 'category':
        setEdits((prev) => ({ ...prev, category: value as ItemCategory }));
        break;
      case 'pattern':
        setEdits((prev) => ({ ...prev, pattern: value as ItemPattern }));
        break;
      case 'colorPrimary':
        setEdits((prev) => ({ ...prev, colorPrimary: value }));
        break;
      case 'name':
        setEdits((prev) => ({ ...prev, name: value }));
        break;
      case 'brand':
        setEdits((prev) => ({ ...prev, brand: value }));
        break;
    }
    // A choice sets and closes; a text field stays open for continued typing.
    if (field !== 'name' && field !== 'brand') setActive(null);
  }

  function toggleColor(word: string) {
    const next = colors.includes(word) ? colors.filter((c) => c !== word) : [...colors, word];
    setEdits((prev) => ({ ...prev, colors: next }));
  }

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.fields}>
        {FIELDS.map((field) => (
          <Fragment key={field}>
            <Field
              label={labels[field]}
              value={merged[field]}
              options={CHOICES[field]}
              open={active === field}
              onToggle={() => setActive((current) => (current === field ? null : field))}
              onSet={(next) => setField(field, next)}
            />
            {/* colours sits next to Main colour; multi-select, panel stays open. */}
            {field === 'colorPrimary' ? (
              <ColorsField
                selected={colors}
                open={active === 'colors'}
                onToggle={() => setActive((current) => (current === 'colors' ? null : 'colors'))}
                onToggleColor={toggleColor}
              />
            ) : null}
          </Fragment>
        ))}
      </View>

      <View style={styles.actions}>
        <Button
          label={strings.common.cancel}
          variant="secondary"
          onPress={onCancel}
          style={styles.action}
        />
        <Button
          label={strings.common.save}
          onPress={() => onSave(edits)}
          disabled={busy}
          style={styles.action}
        />
      </View>
    </ScrollView>
  );
}

interface FieldProps {
  readonly label: string;
  readonly value: string;
  /** Fixed choices for a chip field; omit for a free-text input field. */
  readonly options?: readonly string[];
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly onSet: (next: string) => void;
}

/** One field: a trigger chip showing the value, plus an inline editor when open. */
function Field({ label, value, options, open, onToggle, onSet }: FieldProps) {
  const display = value ? `${label}: ${titleCase(value)}` : strings.closet.fieldUnset(label);

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
                onToggle={() => onSet(option)}
              />
            ))}
          </View>
        ) : (
          <Input
            value={value}
            onChangeText={onSet}
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

/** The colours multi-select: a trigger chip, then a COLOR_WORDS toggle panel that
 * stays open so several colours can be chosen (mirrors the confirm screen). */
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

/** Capitalize the first letter for display; values are stored lowercased. */
function titleCase(value: string): string {
  return value.length > 0 ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.s6,
    gap: spacing.s6,
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
  actions: {
    flexDirection: 'row',
    gap: spacing.s3,
  },
  action: {
    flex: 1,
  },
});
