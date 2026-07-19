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
 */
import { glass, layout, motion, radii, spacing } from '@era/tokens';
import { useEffect, useState, type PropsWithChildren } from 'react';
import {
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
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
}

export function GlassSheet({ open, onClose, busy = false, children }: PropsWithChildren<GlassSheetProps>) {
  const { colors, resolved } = useTheme();
  const reduced = useReducedMotionSafe();
  const { height } = useWindowDimensions();
  const [expanded, setExpanded] = useState(false);

  const peekHeight = height * layout.sheetPeekFraction;
  const expandedHeight = height * layout.sheetPeekFraction * layout.phi;

  // translateY: 0 = fully expanded, (expanded - peek) = peek, expanded = hidden.
  const hiddenY = expandedHeight;
  const peekY = expandedHeight - peekHeight;
  const translateY = useSharedValue(hiddenY);
  const scrim = useSharedValue(0);

  useEffect(() => {
    const target = !open ? hiddenY : expanded ? 0 : peekY;
    const slide = (value: number) =>
      reduced
        ? withTiming(value, { duration: motion.durations.reducedFadeMs })
        : withSpring(value, springFromToken('gentle'));
    translateY.value = slide(target);
    scrim.value = withTiming(open ? 1 : 0, {
      duration: motion.durations.reducedFadeMs,
      easing: tokenEasing,
    });
    if (!open) {
      setExpanded(false);
    }
  }, [open, expanded, hiddenY, peekY, reduced, translateY, scrim]);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));
  const scrimStyle = useAnimatedStyle(() => ({
    opacity: scrim.value * glass.tintOpacity[resolved],
  }));

  return (
    <View pointerEvents={open ? 'auto' : 'none'} style={StyleSheet.absoluteFill}>
      <Animated.View style={[StyleSheet.absoluteFill, scrimStyle]}>
        <Pressable
          accessibilityLabel="Dismiss"
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.ink }]}
          onPress={onClose}
        />
      </Animated.View>

      <Animated.View
        accessibilityViewIsModal={open}
        style={[styles.sheet, { height: expandedHeight }, sheetStyle]}
      >
        {/* Shared §3 glass recipe (BlurView + tint + highlight + border), static
            per the perf contract — only the sheet's transform/scrim animate. The
            panel extends one radius below the sheet so its rounded BOTTOM corners
            fall off-screen (a bottom sheet rounds only its top); the container's
            top-only radii + overflow:hidden clip the visible shape. */}
        <GlassPanel busy={busy} radius={radii.sheet} style={styles.glass} />

        <Press
          accessibilityRole="button"
          accessibilityLabel={expanded ? 'Collapse sheet' : 'Expand sheet'}
          onPress={() => setExpanded((value) => !value)}
          style={styles.handleTap}
        >
          <View style={[styles.handle, { backgroundColor: colors.secondary }]} />
        </Press>

        <View style={styles.body}>{children}</View>
      </Animated.View>
    </View>
  );
}

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
