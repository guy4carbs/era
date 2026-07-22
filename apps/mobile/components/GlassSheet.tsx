/**
 * GlassSheet — a frosted bottom sheet.
 *
 * The frosted material is GlassPanel (the shared §3 recipe) filling the sheet;
 * this component owns only the MOTION — the spring/fade slide up to a "peek"
 * height, the handle-tap expand (peek × φ), and the backdrop scrim. Reduced
 * motion swaps the slide spring for a short fade. Drag-to-dismiss is deferred
 * (needs gesture-handler).
 *
 * `busy` passes through to GlassPanel: sheets floating over IMAGERY (the cutout
 * hero, try-on renders, feed photos) swap to the AA scrim tint so their text
 * stays legible. The glass LAYERS stay STATIC — only the sheet's transform and
 * the scrim opacity animate.
 *
 * Two openings. The DEFAULT surface peeks at `layout.sheetPeekFraction`, taps its
 * handle to expand to peek × φ, and dims the app behind a tinted scrim. The Ovi
 * CHAT overrides both (`heightFraction` + `transparentScrim`): it rises straight
 * to a taller `layout.oviPanel.sheetFraction` of the window with NO tinted scrim
 * — the app stays visible behind the glass, and a transparent layer only catches
 * the tap-outside. With `glowBloom` on, a soft accent glow warms in from the
 * bottom-right (the FAB corner the sheet grew from). Reduced motion fades both.
 *
 * The chat also mirrors the web panel's opening/close CHOREOGRAPHY (D3.2): where
 * a plain sheet just slides, `bloomFromCorner` layers the web's bloom-from-orb —
 * the sheet scales up from `motion.stagger.bloomScale` with its transform-origin
 * pinned to the bottom-right FAB corner and fades in on the gentle spring; closing reverses
 * it (fade + settle back down and in). Reduced motion collapses both to a flat
 * `reducedFadeMs` opacity fade with no scale (matching web's `reducedFadeMs`).
 * `dismissAffordance: 'none'` drops the grab handle entirely (the chat dismisses
 * via its own close button + the tap-outside catcher) — every other consumer keeps
 * the default handle.
 */
import { glow, layout, motion, radii, spacing } from '@era/tokens';
import { useEffect, useState, type PropsWithChildren } from 'react';
import {
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { GlassPanel } from '@/components/GlassPanel';
import { Press } from '@/components/Press';
import { springFromToken, tokenEasing, useReducedMotionSafe } from '@/lib/motion';
import { useTheme } from '@/lib/theme';

interface GlassSheetProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** Float over imagery → GlassPanel swaps to the AA scrim tint. */
  readonly busy?: boolean;
  /**
   * Fraction of the window height the sheet rises to, opening straight to it with
   * NO handle-expand step (the Ovi chat passes `layout.oviPanel.sheetFraction`).
   * Omitted ⇒ the default peek + handle-expand-to-φ behaviour every other surface
   * uses.
   */
  readonly heightFraction?: number;
  /**
   * Retire the tinted backdrop scrim: the app stays visible behind the glass and
   * a transparent layer only catches tap-outside-to-close. The Ovi chat sets this
   * so the conversation never reads as a full-screen page over a dimmed app.
   *
   * Kept for the Ovi chat's explicit intent; note the DEFAULT backdrop is already
   * a transparent catcher now (D3.2 decree — matches web's no-scrim sheet), so a
   * plain sheet needs neither this nor {@link veil}.
   */
  readonly transparentScrim?: boolean;
  /**
   * A whisper veil behind the sheet — a faint ink dim (≤12% ink) instead of the
   * transparent catcher. Reserved for a DESTRUCTIVE confirm (account deletion),
   * where a touch of separation earns the gravity of an irreversible action. Every
   * other sheet keeps the transparent catcher (D3.2). Ignored when
   * `transparentScrim` is set.
   */
  readonly veil?: boolean;
  /**
   * Warm a soft accent glow in from the bottom-right (the FAB corner) as the
   * sheet rises — the opening bloom. Reduced motion still fades it in flat.
   */
  readonly glowBloom?: boolean;
  /**
   * Mirror the web panel's bloom-from-orb choreography: on open the sheet scales
   * up from `motion.stagger.bloomScale` pivoted at the bottom-right FAB corner and fades
   * in; on close it fades + settles back. Layered ON TOP of the slide, so it reads
   * as growing from the corner rather than just rising. Reduced motion drops the
   * scale and runs a flat fade. Off ⇒ the plain slide every other sheet uses.
   */
  readonly bloomFromCorner?: boolean;
  /**
   * The grab affordance at the sheet's top. `'handle'` (default) shows the pill —
   * a toggle on the default sheet, a static grip on a custom-height one. `'none'`
   * drops it entirely: the chat dismisses via its own close button + the
   * tap-outside catcher, so the handle would be dead chrome. Scoped here so the
   * removal never touches the other GlassSheet consumers.
   */
  readonly dismissAffordance?: 'handle' | 'none';
}

export function GlassSheet({
  open,
  onClose,
  busy = false,
  heightFraction,
  transparentScrim = false,
  veil = false,
  glowBloom = false,
  bloomFromCorner = false,
  dismissAffordance = 'handle',
  children,
}: PropsWithChildren<GlassSheetProps>) {
  const { colors, resolved } = useTheme();
  const reduced = useReducedMotionSafe();
  const { height, width } = useWindowDimensions();
  const [expanded, setExpanded] = useState(false);

  // A `heightFraction` sheet rises straight to that height (no peek/expand step);
  // otherwise the default peek + handle-expand-to-φ.
  const custom = heightFraction !== undefined;
  const peekHeight = height * layout.sheetPeekFraction;
  const expandedHeight = custom
    ? height * heightFraction
    : height * layout.sheetPeekFraction * layout.phi;

  // translateY: 0 = fully expanded, (expanded - peek) = peek, expanded = hidden.
  const hiddenY = expandedHeight;
  const peekY = expandedHeight - peekHeight;
  const translateY = useSharedValue(hiddenY);
  const scrim = useSharedValue(0);
  // The bloom-from-corner progress: 0 = closed (small + transparent), 1 = open
  // (full scale + opaque). Drives the web-parity scale/fade; inert unless
  // `bloomFromCorner` is set.
  const bloom = useSharedValue(0);

  useEffect(() => {
    // A custom-height sheet has one open pose (fully risen); the default sheet
    // opens at peek and the handle toggles the expand.
    const openY = custom ? 0 : expanded ? 0 : peekY;
    const target = !open ? hiddenY : openY;
    const slide = (value: number) =>
      reduced
        ? withTiming(value, { duration: motion.durations.reducedFadeMs })
        : withSpring(value, springFromToken('gentle'));
    translateY.value = slide(target);
    scrim.value = withTiming(open ? 1 : 0, {
      duration: motion.durations.reducedFadeMs,
      easing: tokenEasing,
    });
    // The bloom scale/fade shares the sheet's gentle spring (a flat fade under
    // reduced motion) so it settles in lock-step with the rise — the web panel's
    // `springs.gentle` on open, `reducedFadeMs` when reduced.
    bloom.value = reduced
      ? withTiming(open ? 1 : 0, { duration: motion.durations.reducedFadeMs, easing: tokenEasing })
      : withSpring(open ? 1 : 0, springFromToken('gentle'));
    if (!open) {
      setExpanded(false);
    }
  }, [open, expanded, custom, hiddenY, peekY, reduced, translateY, scrim, bloom]);

  const sheetStyle = useAnimatedStyle(() => {
    // Web parity: the panel scales up from `motion.stagger.bloomScale` pivoted at
    // the bottom-right corner (the FAB it grew from). RN scales about the view centre,
    // so we emulate transform-origin bottom-right by compensating the scale with a
    // translate of half the collapsed gap toward that corner — keeping the bottom
    // and right edges pinned while the top-left grows in. Reduced motion holds the
    // scale at 1 (flat fade only), matching web's reducedFadeMs path.
    const scale = reduced || !bloomFromCorner
      ? 1
      : interpolate(bloom.value, [0, 1], [motion.stagger.bloomScale, 1]);
    const originX = (width / 2) * (1 - scale); // + shifts toward the right edge
    const originY = (expandedHeight / 2) * (1 - scale); // + shifts toward the bottom
    return {
      opacity: bloomFromCorner ? bloom.value : 1,
      transform: [
        { translateY: translateY.value },
        { translateX: originX },
        { translateY: originY },
        { scale },
      ],
      // The opening bloom: the glow shadow warms in as the sheet rises, reading as
      // light coming from the FAB corner. Held off entirely when glowBloom is unset.
      shadowOpacity: glowBloom ? scrim.value * glow.opacity[resolved] : 0,
    };
  });
  // The backdrop policy (D3.2): a transparent catcher by default (the app stays
  // visible behind the glass, only tap-outside is caught), matching web's no-scrim
  // sheet. A destructive confirm may opt into a whisper VEIL — a faint ink dim that
  // fades in with the sheet. `transparentScrim` forces the catcher regardless.
  const veiled = veil && !transparentScrim;
  const scrimStyle = useAnimatedStyle(() => ({
    opacity: veiled ? scrim.value * VEIL_OPACITY : 0,
  }));

  return (
    <View pointerEvents={open ? 'auto' : 'none'} style={StyleSheet.absoluteFill}>
      <Animated.View style={[StyleSheet.absoluteFill, scrimStyle]}>
        <Pressable
          accessibilityLabel="Dismiss"
          style={[StyleSheet.absoluteFill, veiled ? { backgroundColor: colors.ink } : undefined]}
          onPress={onClose}
        />
      </Animated.View>

      <Animated.View
        accessibilityViewIsModal={open}
        style={[
          styles.sheet,
          { height: expandedHeight },
          // The bloom glows from the bottom-right corner — a warm accent shadow
          // offset toward the FAB the sheet grew from.
          glowBloom
            ? { shadowColor: colors.accent, shadowRadius: glow.blurRadius, shadowOffset: BLOOM_OFFSET }
            : null,
          sheetStyle,
        ]}
      >
        {/* Shared §3 glass recipe (BlurView + tint + highlight + border), static
            per the perf contract — only the sheet's transform/scrim animate. The
            panel extends one radius below the sheet so its rounded BOTTOM corners
            fall off-screen (a bottom sheet rounds only its top); the container's
            top-only radii + overflow:hidden clip the visible shape. */}
        <GlassPanel busy={busy} radius={radii.sheet} style={styles.glass} />

        {/* The grab affordance. `dismissAffordance: 'none'` (the chat) drops it
            entirely — the close button + tap-outside carry dismissal, so a handle
            would be dead chrome. A custom-height sheet has no handle-expand step,
            so its handle is a static grip; the default sheet's handle toggles the
            expand. */}
        {dismissAffordance === 'none' ? null : custom ? (
          <View style={styles.handleTap} pointerEvents="none">
            <View style={[styles.handle, { backgroundColor: colors.secondary }]} />
          </View>
        ) : (
          <Press
            accessibilityRole="button"
            accessibilityLabel={expanded ? 'Collapse sheet' : 'Expand sheet'}
            onPress={() => setExpanded((value) => !value)}
            style={styles.handleTap}
          >
            <View style={[styles.handle, { backgroundColor: colors.secondary }]} />
          </Press>
        )}

        <View style={styles.body}>{children}</View>
      </Animated.View>
    </View>
  );
}

// The bloom shadow leans toward the bottom-right FAB corner the sheet grew from.
const BLOOM_OFFSET = { width: spacing.s2, height: spacing.s2 } as const;

// The destructive-confirm veil strength — a whisper ink dim (≤12%, D3.2), the
// only sheet allowed a backdrop tint. Every other sheet uses the transparent catcher.
const VEIL_OPACITY = 0.12;

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    // Match GlassPanel's rounded top so the sheet's own children (handle/body)
    // clip to the same corner; GlassPanel behind carries the border + material.
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  // The glass fills the sheet and hangs one radius past the bottom so only the
  // top corners round (see the render comment); the parent clips the overflow.
  glass: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: -radii.sheet,
  },
  handleTap: {
    alignItems: 'center',
    paddingVertical: spacing.s2,
  },
  handle: {
    width: spacing.s8,
    height: spacing.s1,
    borderRadius: radii.chip,
  },
  body: {
    flex: 1,
    padding: spacing.s4,
  },
});
