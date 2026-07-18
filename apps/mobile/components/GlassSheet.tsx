/**
 * GlassSheet — a frosted bottom sheet.
 *
 * Blurs the content behind it (expo-blur), tinted per theme. Springs up to a
 * "peek" height, then a handle tap expands it (peek × φ). A LinearGradient
 * along the top edge approximates the spec's glass inner-highlight / sheen —
 * the only place expo-linear-gradient is used. Reduced motion swaps the slide
 * spring for a short fade. Drag-to-dismiss is deferred (needs gesture-handler).
 */
import { glass, layout, motion, radii, spacing } from '@era/tokens';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
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

import { Press } from '@/components/Press';
import { springFromToken, tokenEasing, useReducedMotionSafe } from '@/lib/motion';
import { useTheme } from '@/lib/theme';

interface GlassSheetProps {
  readonly open: boolean;
  readonly onClose: () => void;
}

export function GlassSheet({ open, onClose, children }: PropsWithChildren<GlassSheetProps>) {
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
        style={[
          styles.sheet,
          {
            height: expandedHeight,
            borderTopLeftRadius: radii.sheet,
            borderTopRightRadius: radii.sheet,
            borderColor: glass.border[resolved],
            borderWidth: glass.borderWidth,
          },
          sheetStyle,
        ]}
      >
        <BlurView
          intensity={glass.blur}
          tint={resolved === 'dark' ? 'dark' : 'light'}
          style={StyleSheet.absoluteFill}
        />
        <View
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.surface, opacity: glass.tintOpacity[resolved] }]}
        />
        <LinearGradient
          colors={[glass.innerHighlightColor[resolved], 'transparent']}
          style={styles.innerHighlight}
          pointerEvents="none"
        />

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
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  innerHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: spacing.s8,
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
