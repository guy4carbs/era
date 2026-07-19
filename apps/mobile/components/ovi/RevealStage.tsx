/**
 * RevealStage — the Today's Look ritual (D9), Era's signature daily moment.
 *
 * One staged sequence, driven by a SINGLE `step` counter advanced by a cancellable
 * timer chain (never fire-and-forget springs):
 *
 *   Stage 1 — cream canvas: the day ('Today', Fraunces largeTitle) + the weather
 *     whisper, if conditions came back.
 *   Stage 2 — assembly: the look's cutouts spring in one by one on the gentle
 *     spring, `itemIntervalMs` apart, layered by slot order (shoes behind →
 *     accessory in front) in an overlapped editorial stack — not a grid. Each
 *     piece's shadow lands `shadowLagMs` after the piece.
 *   Stage 3 — settle: the assembled stack composes into the finished card with
 *     Ovi's one italic `revealLine` and two quiet actions (Wear it / Something
 *     else) plus a caption-quiet Share. ONE light-impact haptic marks the settle.
 *
 * A tap ANYWHERE fast-forwards to the settled card: pending timers are cleared and
 * every shared value snaps to its final on a short fade, so the ritual is always
 * skippable and never leaves an animation mid-flight. Under reduced motion the
 * whole thing collapses to a single cross-fade from cream canvas to composed card
 * — no assembly.
 *
 * Budget: the sequence fits `motion.reveal.maxTotalMs`. With more than five pieces
 * the interval compresses ((maxTotalMs − settleMs) / n) so a long look still lands
 * inside the gift-budget.
 *
 * The composed card reuses TodayCard's accept/wear-log/reject flows — this IS the
 * one Today surface; TodayCard delegates to it. Share exports through the existing
 * offscreen collage host via {@link TodayStoryCard}.
 */
import { motion, palette, radii, spacing } from '@era/tokens';
import { slotForCategory, type OutfitSlot, type ProposedOutfit } from '@era/core/ovi';
import { strings } from '@era/core/strings';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Text } from '@/components/Text';
import { Button } from '@/components/Button';
import { Press } from '@/components/Press';
import { ItemSurface } from '@/components/items';
import { springFromToken, tokenEasing, useReducedMotionSafe } from '@/lib/motion';
import { useTheme } from '@/lib/theme';

import type { OviWeather } from './api';

/** Back-to-front paint order for the overlapped stack — shoes anchor, accessory tops. */
const SLOT_LAYER: Record<OutfitSlot, number> = {
  shoes: 0,
  bottom: 1,
  base: 2,
  outerwear: 3,
  accessory: 4,
};

/**
 * A cutout resolved to its slot for the assembly. `order` is the back-to-front
 * index (paint + entrance sequence); `url` is the closet displayUrl.
 */
interface RevealPiece {
  readonly id: string;
  readonly url: string;
  readonly slot: OutfitSlot;
  readonly order: number;
}

/**
 * Resolve the outfit's item ids to cutout pieces, ordered by slot layer. Ids
 * without a resolved category or url are dropped (Ovi never invents an item, so a
 * stale id simply doesn't assemble). Category lookup comes from the same map the
 * closet already built.
 */
export function revealPieces(
  outfit: ProposedOutfit,
  urlById: ReadonlyMap<string, string>,
  categoryById: ReadonlyMap<string, string>,
): readonly RevealPiece[] {
  const pieces: { id: string; url: string; slot: OutfitSlot }[] = [];
  for (const id of outfit.itemIds) {
    const url = urlById.get(id);
    const category = categoryById.get(id);
    if (!url || !category) continue;
    const slot = slotForCategory(category);
    if (!slot) continue;
    pieces.push({ id, url, slot });
  }
  pieces.sort((a, b) => SLOT_LAYER[a.slot] - SLOT_LAYER[b.slot]);
  return pieces.map((piece, order) => ({ ...piece, order }));
}

/**
 * The per-piece interval, compressed so the whole sequence still fits the budget
 * when the look runs longer than the stylist's five-slot cap:
 *   interval = min(itemIntervalMs, (maxTotalMs − settleMs) / n).
 */
export function revealInterval(count: number): number {
  if (count <= 0) return motion.reveal.itemIntervalMs;
  const budgeted = (motion.reveal.maxTotalMs - motion.reveal.settleMs) / count;
  return Math.min(motion.reveal.itemIntervalMs, budgeted);
}

/** Editorial offsets (fraction of the stage) per slot — an overlapped stack, not a grid. */
const SLOT_OFFSET: Record<OutfitSlot, { x: number; y: number }> = {
  shoes: { x: 0.16, y: 0.62 },
  bottom: { x: -0.14, y: 0.28 },
  base: { x: 0.1, y: -0.04 },
  outerwear: { x: -0.18, y: -0.02 },
  accessory: { x: 0.28, y: -0.22 },
};

interface RevealStageProps {
  readonly outfit: ProposedOutfit;
  /** Cutout URLs keyed by item id (the closet's resolved displayUrls). */
  readonly urlById: ReadonlyMap<string, string>;
  /** Item categories keyed by id — drives slot layering. */
  readonly categoryById: ReadonlyMap<string, string>;
  readonly weather: OviWeather | null;
  readonly revealLine: string | null;
  /** Skip straight to the composed card (a returning visit already saw the ritual). */
  readonly initiallySettled: boolean;
  /** Fired once the ritual reaches the composed card (play-through or skip). */
  readonly onSettled?: () => void;
  /** Save + wear-log the look — TodayCard's accept flow. */
  readonly onWear: () => void;
  /** Decline today's look — TodayCard's reject flow. */
  readonly onElse: () => void;
  /** Export the composed reveal as a Stories card. */
  readonly onShare: () => void;
  /** Whether a wear/share action is in flight (disables the actions). */
  readonly busy: boolean;
  /** True once the look has been saved — the actions collapse to a quiet confirmed line. */
  readonly saved: boolean;
  /** Busy label to show on Share while the export composes. */
  readonly sharePreparing: boolean;
}

export function RevealStage({
  outfit,
  urlById,
  categoryById,
  weather,
  revealLine,
  initiallySettled,
  onSettled,
  onWear,
  onElse,
  onShare,
  busy,
  saved,
  sharePreparing,
}: RevealStageProps) {
  const { colors } = useTheme();
  const reduced = useReducedMotionSafe();

  const pieces = useMemo(
    () => revealPieces(outfit, urlById, categoryById),
    [outfit, urlById, categoryById],
  );

  // The single source of truth for the sequence: how many pieces have entered.
  // -1 means "canvas only" (Stage 1); pieces.length means "assembly done".
  // `settled` is the terminal Stage-3 flag, independent so skip can jump straight
  // to it without racing the piece counter.
  const [revealed, setRevealed] = useState(initiallySettled ? pieces.length : -1);
  const [settled, setSettled] = useState(initiallySettled);

  // Cross-fade driver for the composed card (0 → 1). Under reduced motion this is
  // the ONLY animation; on the full path it fades the settled card in over the
  // assembled stack.
  const composeOpacity = useSharedValue(initiallySettled ? 1 : 0);

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const settledRef = useRef(initiallySettled);
  const notifiedRef = useRef(false);

  const clearTimers = useCallback(() => {
    for (const id of timers.current) clearTimeout(id);
    timers.current = [];
  }, []);

  const notifySettled = useCallback(() => {
    if (notifiedRef.current) return;
    notifiedRef.current = true;
    onSettled?.();
  }, [onSettled]);

  // Land on the composed card — the shared terminal for play-through AND skip. One
  // light-impact haptic marks the settle (the outfit-save grammar; no sound, ever).
  const settle = useCallback(() => {
    if (settledRef.current) return;
    settledRef.current = true;
    clearTimers();
    setRevealed(pieces.length);
    setSettled(true);
    composeOpacity.value = withTiming(1, {
      duration: reduced ? motion.durations.reducedFadeMs : motion.durations.minMs,
      easing: tokenEasing,
    });
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    notifySettled();
  }, [clearTimers, composeOpacity, notifySettled, pieces.length, reduced]);

  // Drive the sequence once on mount. Reduced motion skips assembly entirely —
  // a single cross-fade straight to the composed card.
  useEffect(() => {
    if (settledRef.current) {
      return;
    }
    if (reduced) {
      settle();
      return clearTimers;
    }

    const interval = revealInterval(pieces.length);
    // Stage 2: advance the piece counter one beat at a time.
    for (let i = 0; i < pieces.length; i += 1) {
      timers.current.push(
        setTimeout(() => setRevealed(i), interval * i),
      );
    }
    // Stage 3: settle a beat after the last piece has had time to land its shadow.
    const assemblyMs = interval * pieces.length + motion.reveal.shadowLagMs;
    timers.current.push(setTimeout(() => settle(), assemblyMs));

    return clearTimers;
    // Mount-only choreography, intentionally: the sequence runs once when the
    // stage first mounts (after TodayCard's fetch resolves). `settle`/`clearTimers`
    // are stable and `pieces` is memoized off the outfit, so nothing here should
    // re-trigger the ritual — the per-day gate in feed.tsx is what governs replay.
  }, []);

  const composedStyle = useAnimatedStyle(() => ({ opacity: composeOpacity.value }));
  // The assembled stack sits under the composed card and fades out as it arrives,
  // so the settle is a genuine compose, not a hard cut.
  const stackStyle = useAnimatedStyle(() => ({ opacity: 1 - composeOpacity.value }));

  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={strings.reveal.skipA11y}
      onPress={settle}
      disabled={settled}
      style={[styles.stage, { backgroundColor: colors.bg }]}
    >
      {/* Stage 1 — the cream canvas heading. Present through assembly; the composed
          card's own title takes over once settled. */}
      {!settled ? (
        <View style={styles.canvasHead}>
          <Text variant="largeTitle" color={colors.text}>
            {strings.reveal.title}
          </Text>
          {weather ? (
            <Text variant="body" size="subhead" color={colors.secondaryStrong}>
              {strings.ovi.weatherLine(weather.tempC, weather.condition)}
            </Text>
          ) : null}
        </View>
      ) : null}

      {/* The assembly stage — the overlapped cutout stack. Hidden under reduced
          motion (which cross-fades straight to the composed card). */}
      {!reduced ? (
        <Animated.View style={[styles.assembly, stackStyle]} pointerEvents="none">
          {pieces.map((piece) => (
            <RevealCutout key={piece.id} piece={piece} shown={revealed >= piece.order} />
          ))}
        </Animated.View>
      ) : null}

      {/* Stage 3 — the composed card, cross-faded in. Mounted only from settle so
          its actions never intercept a skip tap mid-assembly. */}
      {settled ? (
        <Animated.View style={composedStyle}>
          <ComposedCard
            colors={colors}
            pieces={pieces}
            revealLine={revealLine}
            onWear={onWear}
            onElse={onElse}
            onShare={onShare}
            busy={busy}
            saved={saved}
            sharePreparing={sharePreparing}
          />
        </Animated.View>
      ) : null}
    </Press>
  );
}

/** One cutout in the assembly — springs in (opacity + scale + rise) with its shadow lagging. */
function RevealCutout({ piece, shown }: { readonly piece: RevealPiece; readonly shown: boolean }) {
  const progress = useSharedValue(0);
  const shadow = useSharedValue(0);

  useEffect(() => {
    if (!shown) return;
    progress.value = withSpring(1, springFromToken('gentle'));
    // The shadow lands a beat after its piece — the depth cue the spec calls for.
    shadow.value = withDelay(
      motion.reveal.shadowLagMs,
      withTiming(1, { duration: motion.durations.minMs, easing: tokenEasing }),
    );
  }, [shown, progress, shadow]);

  const offset = SLOT_OFFSET[piece.slot];

  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      { translateX: `${offset.x * 100}%` },
      { translateY: `${offset.y * 100}%` },
      { translateY: (1 - progress.value) * motion.stagger.riseYPx },
      { scale: 0.9 + progress.value * 0.1 },
    ],
  }));

  const shadowStyle = useAnimatedStyle(() => ({ opacity: shadow.value * 0.5 }));

  return (
    <Animated.View style={[styles.cutout, style]}>
      <Animated.View style={[styles.cutoutShadow, shadowStyle]} />
      <ItemSurface uri={piece.url} accessibilityLabel="" interactive="none" fill />
    </Animated.View>
  );
}

interface ComposedCardProps {
  readonly colors: ReturnType<typeof useTheme>['colors'];
  readonly pieces: readonly RevealPiece[];
  readonly revealLine: string | null;
  readonly onWear: () => void;
  readonly onElse: () => void;
  readonly onShare: () => void;
  readonly busy: boolean;
  readonly saved: boolean;
  readonly sharePreparing: boolean;
}

/**
 * The finished card — the assembled look composed with Ovi's one italic line and
 * two quiet actions. The stack is re-drawn statically (all pieces shown) so the
 * composed state reads identically to the last assembly frame, minus the motion.
 */
function ComposedCard({
  colors,
  pieces,
  revealLine,
  onWear,
  onElse,
  onShare,
  busy,
  saved,
  sharePreparing,
}: ComposedCardProps) {
  return (
    <View style={styles.composed}>
      <View style={styles.composedStack} pointerEvents="none">
        {pieces.map((piece) => (
          <StaticCutout key={piece.id} piece={piece} />
        ))}
      </View>

      {revealLine ? (
        <Text variant="oviAccent" color={colors.text} style={styles.revealLine}>
          {revealLine}
        </Text>
      ) : null}

      {saved ? (
        <View style={styles.savedRow}>
          <Text variant="ui" size="footnote" weight={600} color={colors.accent} accessibilityRole="text">
            {strings.ovi.accepted}
          </Text>
          <Press
            accessibilityRole="button"
            accessibilityLabel={strings.reveal.shareCta}
            onPress={onShare}
            disabled={sharePreparing}
          >
            <Text variant="ui" size="footnote" weight={600} color={colors.secondaryStrong}>
              {sharePreparing ? strings.share.preparing : strings.reveal.shareCta}
            </Text>
          </Press>
        </View>
      ) : (
        <View style={styles.actions}>
          <View style={styles.actionRow}>
            <Button
              label={strings.reveal.wearCta}
              variant="primary"
              haptic
              disabled={busy}
              onPress={onWear}
              style={styles.action}
            />
            <Button
              label={strings.reveal.elseCta}
              variant="secondary"
              disabled={busy}
              onPress={onElse}
              style={styles.action}
            />
          </View>
          <Press
            accessibilityRole="button"
            accessibilityLabel={strings.reveal.shareCta}
            onPress={onShare}
            disabled={sharePreparing}
            style={styles.shareTap}
          >
            <Text variant="ui" size="footnote" weight={600} color={colors.secondaryStrong}>
              {sharePreparing ? strings.share.preparing : strings.reveal.shareCta}
            </Text>
          </Press>
        </View>
      )}
    </View>
  );
}

/** The settled-frame cutout — same offset as its assembly counterpart, no motion. */
function StaticCutout({ piece }: { readonly piece: RevealPiece }) {
  const offset = SLOT_OFFSET[piece.slot];
  return (
    <View
      style={[
        styles.cutout,
        { transform: [{ translateX: `${offset.x * 100}%` }, { translateY: `${offset.y * 100}%` }] },
      ]}
    >
      <ItemSurface uri={piece.url} accessibilityLabel="" interactive="none" fill />
    </View>
  );
}

const styles = StyleSheet.create({
  stage: {
    borderRadius: radii.card,
    borderCurve: 'continuous',
    overflow: 'hidden',
    padding: spacing.s4,
    gap: spacing.s3,
  },
  canvasHead: {
    gap: spacing.s1,
  },
  // The assembly and the composed stack share a 4:5 editorial stage the cutouts
  // are absolutely placed within.
  assembly: {
    width: '100%',
    aspectRatio: 0.8,
  },
  cutout: {
    position: 'absolute',
    top: '10%',
    left: '10%',
    width: '52%',
    aspectRatio: 0.8,
  },
  // A soft warm shadow behind each cutout, opacity-animated in a beat after the
  // piece (no true view blur on RN, so this is a tinted rounded slab).
  cutoutShadow: {
    position: 'absolute',
    top: '6%',
    left: '4%',
    right: '-4%',
    bottom: '-6%',
    borderRadius: radii.card,
    borderCurve: 'continuous',
    backgroundColor: palette.ink,
  },
  composed: {
    gap: spacing.s3,
  },
  composedStack: {
    width: '100%',
    aspectRatio: 0.8,
  },
  revealLine: {
    textAlign: 'center',
  },
  actions: {
    gap: spacing.s2,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.s2,
  },
  action: {
    flex: 1,
  },
  shareTap: {
    alignSelf: 'center',
    paddingVertical: spacing.s1,
  },
  savedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
