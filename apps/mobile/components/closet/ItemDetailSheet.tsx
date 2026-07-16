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
import { type TurnaroundRender, type TurnaroundState } from '@era/core/turnaround';
import { layout, motion, radii, rnShadow, spacing, typeRamp } from '@era/tokens';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Button } from '@/components/Button';
import { GlassSheet } from '@/components/GlassSheet';
import { archiveItem, patchItem, type ItemUpdates, type ItemWithDisplay } from '@/components/items';
import { WearStatsBlock } from '@/components/wear';
import { useReducedMotionSafe } from '@/lib/motion';
import { LimitReachedError } from '@/lib/rate-limit';
import { useTheme } from '@/lib/theme';
import { eraTurnaroundEnabled } from '@/lib/turnaround-flag';

import { AngleViewer } from './AngleViewer';
import { DimensionalHero } from './DimensionalHero';
import { ItemEditor } from './ItemEditor';
import {
  fetchTurnaround,
  generateTurnaround,
  pollTurnaround,
  TurnaroundUnavailableError,
} from './turnaround-api';

interface ItemDetailSheetProps {
  readonly item: ItemWithDisplay | null;
  readonly open: boolean;
  readonly onClose: () => void;
  /** Called with the merged, freshly-saved item — the screen replaces the tile. */
  readonly onUpdated: (item: ItemWithDisplay) => void;
  /** Called after the item is archived — the screen toasts and drops the tile. */
  readonly onArchived: (id: string) => void;
  /** Surface a toast (wear-logged confirmation) to the screen's own Toast. */
  readonly onToast: (message: string) => void;
}

export function ItemDetailSheet({ item, open, onClose, onUpdated, onArchived, onToast }: ItemDetailSheetProps) {
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

  // Confirm an unconfirmed draft as it stands (PATCH `confirm: true`, no edits) —
  // the detail-sheet path out of the draft dead-end for a piece the user backed
  // out of before confirming, or a web receipt draft viewed here. Confirming from
  // the sheet keeps mobile's per-item surface in one place; Edit is right there
  // first if a tag needs a fix.
  async function confirmDraft() {
    if (!item) return;
    setBusy(true);
    try {
      const saved = await patchItem(item.id, { confirm: true });
      const merged: ItemWithDisplay = {
        ...item,
        ...saved,
        displayUrl: item.displayUrl,
        wearCount: item.wearCount,
      };
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onUpdated(merged);
      onClose();
    } catch {
      // Leave the sheet open so the user can retry; nothing destructive happened.
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
            busy={busy}
            onConfirm={confirmDraft}
            onEdit={() => setEditing(true)}
            onArchived={onArchived}
            onClose={onClose}
            onToast={onToast}
          />
        )
      ) : null}
    </GlassSheet>
  );
}

interface DetailProps {
  readonly item: ItemWithDisplay;
  /** A confirm/edit request is in flight — guards the draft-confirm button. */
  readonly busy: boolean;
  /** Confirm an unconfirmed draft as it stands (PATCH `confirm: true`). */
  readonly onConfirm: () => void;
  readonly onEdit: () => void;
  readonly onArchived: (id: string) => void;
  readonly onClose: () => void;
  readonly onToast: (message: string) => void;
}

function Detail({ item, busy, onConfirm, onEdit, onArchived, onClose, onToast }: DetailProps) {
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
      {/* Turnaround views (flag-gated): the swipe-through angle viewer when
          renders exist, else the untouched static hero as the exact fallback. */}
      {eraTurnaroundEnabled && item.displayUrl ? (
        <TurnaroundHero key={item.id} item={item} onToast={onToast} />
      ) : (
        <StaticHero item={item} />
      )}

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
      </View>

      {/* Wear count + cost-per-wear + one-tap "wore it today", keyed per item so
          the button's session guard resets when a different piece opens. */}
      <WearStatsBlock
        key={item.id}
        itemId={item.id}
        currency={item.currency}
        seedWearCount={item.wearCount}
        seedPrice={item.purchasePrice}
        onToast={onToast}
      />

      {/* An unconfirmed draft (backed out of before confirming, or a receipt
          draft) gets the primary confirm here — the sheet's way out of the
          dead-end. Confirmed pieces never show it. */}
      {!item.tagsConfirmed ? (
        <Button label={strings.closet.confirmCta} onPress={onConfirm} disabled={busy} />
      ) : null}

      <View style={styles.actions}>
        <Button label={strings.closet.edit} variant="secondary" onPress={onEdit} style={styles.action} />
        <Button label={strings.closet.archive} variant="ghost" onPress={confirmArchive} style={styles.action} />
      </View>
    </ScrollView>
  );
}

/**
 * The cutout hero — the original detail image, now given depth by
 * {@link DimensionalHero} (gyro + drag driven 2.5D tilt/parallax/sheen; a plain
 * static image under reduced motion). Kept as the turnaround fallback (flag off,
 * no cutout, or no accepted renders) and used for the turnaround's front/offer
 * states, so both hero paths gain the same dimensionality.
 */
function StaticHero({ item }: { readonly item: ItemWithDisplay }) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.hero,
        rnShadow('e2'),
        { backgroundColor: colors.surface, borderColor: colors.hairline },
      ]}
    >
      {item.displayUrl ? (
        <DimensionalHero
          uri={item.displayUrl}
          style={styles.heroImage}
          accessibilityLabel={item.name}
        />
      ) : (
        <View style={styles.heroImage} />
      )}
    </View>
  );
}

/** The turnaround surface's UI phase — drives which chrome shows over the hero. */
type TurnaroundPhase = 'fallback' | 'offer' | 'generating' | 'angles' | 'empty';

/**
 * The turnaround-aware hero. On open it reads the item's turnaround state (silent
 * failure → the static hero, nothing surfaced). Complete renders show the
 * {@link AngleViewer}; a still-`running` run polls to completion; an eligible
 * un-run piece offers a quiet "View angles" that kicks the slow generation and
 * animates the viewer in. A daily cap toasts (Ovi's line), the feature being off
 * shows the dormant "unavailable" beat, a QA-passed-nothing run shows one calm
 * line, and any other miss is a calm retryable notice with the button back.
 */
function TurnaroundHero({
  item,
  onToast,
}: {
  readonly item: ItemWithDisplay;
  readonly onToast: (message: string) => void;
}) {
  const { colors } = useTheme();
  const reduced = useReducedMotionSafe();

  const [phase, setPhase] = useState<TurnaroundPhase>('fallback');
  const [renders, setRenders] = useState<readonly TurnaroundRender[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  // A generation runs ~60–90s; guard every settle against a closed sheet so a
  // late resolve can't set state on an unmounted piece.
  const activeRef = useRef(true);

  const finishGeneration = useCallback((state: TurnaroundState) => {
    if (state.renders.length > 0) {
      setRenders(state.renders);
      setPhase('angles');
    } else {
      // Completed, but QA passed nothing — one calm terminal line with no
      // retry verb, because this state offers no button to retry with.
      setNotice(strings.turnaround.noAngles);
      setPhase('empty');
    }
  }, []);

  const handleGenerateError = useCallback(
    (error: unknown) => {
      if (error instanceof LimitReachedError) {
        // Same warm daily-cap voice as web — never drop to the cold generic line.
        onToast(error.serverMessage ?? strings.ovi.limitReachedProcessing);
        setPhase('offer'); // the cap resets tomorrow — leave the affordance
      } else if (error instanceof TurnaroundUnavailableError) {
        setNotice(strings.turnaround.unavailable);
        setPhase('empty');
      } else {
        setNotice(strings.turnaround.failed);
        setPhase('offer'); // calm, retryable — button back
      }
    },
    [onToast],
  );

  const runGeneration = useCallback(() => {
    setNotice(null);
    setPhase('generating');
    void (async () => {
      try {
        const state = await generateTurnaround(item.id);
        if (activeRef.current) finishGeneration(state);
      } catch (error) {
        if (activeRef.current) handleGenerateError(error);
      }
    })();
  }, [item.id, finishGeneration, handleGenerateError]);

  useEffect(() => {
    activeRef.current = true;
    let cancelled = false;
    void (async () => {
      try {
        const state = await fetchTurnaround(item.id);
        if (cancelled) return;
        if (state.status === 'complete' && state.renders.length > 0) {
          setRenders(state.renders);
          setPhase('angles');
        } else if (state.status === 'running') {
          setPhase('generating');
          try {
            const settled = await pollTurnaround(item.id);
            if (!cancelled && activeRef.current) finishGeneration(settled);
          } catch (error) {
            if (!cancelled && activeRef.current) handleGenerateError(error);
          }
        } else if ((state.status === 'none' || state.status === 'failed') && state.categoryEnabled) {
          setPhase('offer');
        } else {
          setPhase('fallback');
        }
      } catch {
        // Silent: no turnaround for this piece (404 / flag off / not owner) — the
        // static hero stays exactly as it was, nothing surfaced.
      }
    })();
    return () => {
      cancelled = true;
      activeRef.current = false;
    };
  }, [item.id, finishGeneration, handleGenerateError]);

  const frontUrl = item.displayUrl;
  if (!frontUrl) return <StaticHero item={item} />;

  if (phase === 'angles') {
    return (
      <Animated.View entering={reduced ? undefined : FadeIn.duration(motion.durations.maxMs)}>
        <AngleViewer frontUrl={frontUrl} renders={renders} />
      </Animated.View>
    );
  }

  return (
    <View style={styles.turnaround}>
      <StaticHero item={item} />
      {phase === 'generating' ? (
        <View style={styles.turnaroundRow}>
          <ActivityIndicator color={colors.secondaryStrong} />
          <Text style={[styles.turnaroundNote, { color: colors.secondaryStrong }]}>
            {strings.turnaround.generating}
          </Text>
        </View>
      ) : null}
      {notice ? (
        <Text style={[styles.turnaroundNote, { color: colors.secondaryStrong }]}>{notice}</Text>
      ) : null}
      {phase === 'offer' ? (
        <Button label={strings.turnaround.viewAngles} variant="secondary" onPress={runGeneration} />
      ) : null}
    </View>
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
  turnaround: {
    gap: spacing.s3,
  },
  turnaroundRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
  },
  turnaroundNote: {
    fontSize: typeRamp.subhead.pt,
    lineHeight: typeRamp.subhead.lineHeight,
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
