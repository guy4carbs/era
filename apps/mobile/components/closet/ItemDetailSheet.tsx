/**
 * ItemDetailSheet — the piece's detail, in the frosted GlassSheet.
 *
 * Shows the cutout large on a cream/charcoal card, the name and brand, read-only
 * tag chips (category, main colour, colours, pattern), the provenance and price
 * lines, and the wear count. Two actions: EDIT swaps the body for the compact
 * ItemEditor (an in-closet edit, PATCH `{ updates }` — no add-flow heading and no
 * `confirm` flag); ARCHIVE confirms via a native alert, then PATCHes
 * `{ archived: true }`, fires a light haptic, and hands the id back so the screen
 * can toast and drop the tile.
 *
 * On a save, the returned row is merged over the item (keeping the resolved
 * displayUrl / wearCount the list route handed us) and handed back via
 * `onUpdated`, so the gallery replaces the tile in place without a re-fetch.
 *
 * The sheet itself (backdrop + drag handle + slide) and reduced-motion handling
 * live in GlassSheet.
 */
import { strings } from '@era/core/strings';
import { layout, radii, rnShadow, spacing, typeRamp } from '@era/tokens';
import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { Alert, Image, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { GlassSheet } from '@/components/GlassSheet';
import { archiveItem, patchItem, type ItemUpdates, type ItemWithDisplay } from '@/components/items';
import { useTheme } from '@/lib/theme';

import { ItemEditor } from './ItemEditor';

interface ItemDetailSheetProps {
  readonly item: ItemWithDisplay | null;
  readonly open: boolean;
  readonly onClose: () => void;
  /** Called with the merged, freshly-saved item — the screen replaces the tile. */
  readonly onUpdated: (item: ItemWithDisplay) => void;
  /** Called after the item is archived — the screen toasts and drops the tile. */
  readonly onArchived: (id: string) => void;
}

export function ItemDetailSheet({ item, open, onClose, onUpdated, onArchived }: ItemDetailSheetProps) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  // Always return to the detail view when the sheet closes.
  useEffect(() => {
    if (!open) {
      setEditing(false);
      setBusy(false);
    }
  }, [open]);

  async function saveEdits(updates: ItemUpdates) {
    if (!item) return;
    // Nothing touched — just fall back to the detail view, no request.
    if (Object.keys(updates).length === 0) {
      setEditing(false);
      return;
    }
    setBusy(true);
    try {
      const saved = await patchItem(item.id, { updates });
      // Merge the server's row over the current one, keeping the resolved
      // displayUrl / wearCount the list route already handed us.
      const merged: ItemWithDisplay = {
        ...item,
        ...saved,
        displayUrl: item.displayUrl,
        wearCount: item.wearCount,
      };
      // The save moment — a small warmth, the same the add-flow save gets.
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onUpdated(merged);
      setEditing(false);
    } catch {
      // Leave the editor open so the user can retry; no destructive change made.
    } finally {
      setBusy(false);
    }
  }

  return (
    <GlassSheet open={open} onClose={onClose}>
      {item ? (
        editing ? (
          <ItemEditor
            item={item}
            busy={busy}
            onSave={saveEdits}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <Detail
            item={item}
            onEdit={() => setEditing(true)}
            onArchived={onArchived}
            onClose={onClose}
          />
        )
      ) : null}
    </GlassSheet>
  );
}

interface DetailProps {
  readonly item: ItemWithDisplay;
  readonly onEdit: () => void;
  readonly onArchived: (id: string) => void;
  readonly onClose: () => void;
}

function Detail({ item, onEdit, onArchived, onClose }: DetailProps) {
  const { colors } = useTheme();

  const tags = buildTags(item);
  const price = formatPrice(item.purchasePrice, item.currency);

  function confirmArchive() {
    // Archiving is reversible (the item is tucked away, not deleted), so the
    // confirm reads as a default action — not the red `destructive` styling.
    Alert.alert('', strings.closet.archiveConfirm, [
      { text: strings.common.cancel, style: 'cancel' },
      {
        text: strings.closet.archive,
        style: 'default',
        onPress: () => {
          void (async () => {
            try {
              await archiveItem(item.id);
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onArchived(item.id);
              onClose();
            } catch {
              // Leave the sheet open; the tile stays put so the user can retry.
            }
          })();
        },
      },
    ]);
  }

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View
        style={[
          styles.hero,
          rnShadow('e2'),
          { backgroundColor: colors.surface, borderColor: colors.hairline },
        ]}
      >
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

      <View style={styles.headings}>
        <Text
          style={{
            color: colors.text,
            fontSize: typeRamp.title1.pt,
            lineHeight: typeRamp.title1.lineHeight,
            fontWeight: '600',
          }}
        >
          {item.name}
        </Text>
        {item.brand ? (
          <Text
            style={{
              color: colors.secondaryStrong,
              fontSize: typeRamp.body.pt,
              lineHeight: typeRamp.body.lineHeight,
            }}
          >
            {item.brand}
          </Text>
        ) : null}
      </View>

      {tags.length > 0 ? (
        <View style={styles.tags}>
          {tags.map((tag) => (
            <View
              key={tag}
              style={[styles.tag, { backgroundColor: colors.surface, borderColor: colors.hairline }]}
            >
              <Text
                style={{
                  color: colors.text,
                  fontSize: typeRamp.footnote.pt,
                  lineHeight: typeRamp.footnote.lineHeight,
                }}
              >
                {tag}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.meta}>
        <MetaLine text={strings.closet.detailSource(item.source)} />
        {price ? <MetaLine text={price} /> : null}
        <MetaLine text={strings.closet.detailWearCount(item.wearCount)} />
      </View>

      <View style={styles.actions}>
        <Button label={strings.closet.edit} variant="secondary" onPress={onEdit} style={styles.action} />
        <Button label={strings.closet.archive} variant="ghost" onPress={confirmArchive} style={styles.action} />
      </View>
    </ScrollView>
  );
}

function MetaLine({ text }: { readonly text: string }) {
  const { colors } = useTheme();
  return (
    <Text
      style={{
        color: colors.secondaryStrong,
        fontSize: typeRamp.subhead.pt,
        lineHeight: typeRamp.subhead.lineHeight,
      }}
    >
      {text}
    </Text>
  );
}

/** Read-only tag labels: category, main colour, extra colours, pattern. */
function buildTags(item: ItemWithDisplay): readonly string[] {
  const tags: string[] = [strings.closet.categoryLabel(item.category)];
  if (item.colorPrimary) tags.push(titleCase(item.colorPrimary));
  for (const color of item.colors ?? []) {
    if (color !== item.colorPrimary) tags.push(titleCase(color));
  }
  if (item.pattern) tags.push(titleCase(item.pattern));
  return tags;
}

/** Join currency and price into one line, e.g. "USD 120". Null when unpriced. */
function formatPrice(price: string | null, currency: string | null): string | null {
  if (!price) return null;
  return [currency, price].filter(Boolean).join(' ');
}

function titleCase(value: string): string {
  return value.length > 0 ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.s4,
    paddingBottom: spacing.s6,
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
  headings: {
    gap: spacing.s1,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.s2,
  },
  tag: {
    borderRadius: radii.chip,
    borderWidth: StyleSheet.hairlineWidth,
    borderCurve: 'continuous',
    paddingVertical: spacing.s2,
    paddingHorizontal: spacing.s3,
  },
  meta: {
    gap: spacing.s1,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.s3,
    marginTop: spacing.s2,
  },
  action: {
    flex: 1,
  },
});
