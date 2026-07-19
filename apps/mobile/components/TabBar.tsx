/**
 * TabBar — the app's bottom navigation, a floating glass pill.
 *
 * A rounded GlassPanel that floats above the home-indicator inset (inset margins,
 * pill radius), carrying the shared §3 glass recipe untouched inside. This file
 * owns the tab layout, the active treatment, and the hide-on-scroll motion.
 *
 * ACTIVE tab: the label goes full ink (`colors.text`) over a small accent glow
 * DOT beneath it (an accent circle with an accent-tinted iOS shadow, composed the
 * same way OviFab builds its halo). INACTIVE tabs carry no dot and a quieter label
 * (`colors.secondaryStrong`); the dot's slot is always reserved so labels never
 * jump between states.
 *
 * The pill hides on scroll-down and returns on scroll-up: it reads the shared
 * `visible` value from {@link TabBarVisibility} and slides fully off-screen on the
 * gentle spring (a fade under reduced motion), going `pointerEvents: none` while
 * hidden. The GlassPanel's blur/tint stay static by contract — only the OUTER
 * wrapper transforms, and the glow lives on that wrapper so overflow:hidden inside
 * the panel never clips it.
 */
import { glow, layout, motion, radii, spacing } from '@era/tokens';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassPanel } from '@/components/GlassPanel';
import { Press } from '@/components/Press';
import { Text } from '@/components/Text';
import { useTabBarVisibility } from '@/components/TabBarVisibility';
import { springFromToken, tokenEasing, useReducedMotionSafe } from '@/lib/motion';
import { useTheme } from '@/lib/theme';

export type TabKey = 'feed' | 'closet' | 'design' | 'shop';

const TABS: readonly { readonly key: TabKey; readonly label: string }[] = [
  { key: 'feed', label: 'Feed' },
  { key: 'closet', label: 'Closet' },
  { key: 'design', label: 'Design' },
  { key: 'shop', label: 'Shop' },
];

// The 6px active indicator dot (`layout.rail.glowDotPx`) and the gap that seats it
// under the label. Both states reserve this height so the label never shifts.
const DOT = layout.rail.glowDotPx;

interface TabBarProps {
  readonly active: TabKey;
  readonly onChange: (tab: TabKey) => void;
}

export function TabBar({ active, onChange }: TabBarProps) {
  const { colors, resolved } = useTheme();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotionSafe();
  const visibility = useTabBarVisibility();
  const visible = visibility?.visible;

  // Off-screen travel: the pill's height plus everything below it (safe-area inset,
  // bottom gap) and a little glow headroom, so hidden means fully gone.
  const bottomGap = insets.bottom + spacing.s3;
  const hiddenTravel = layout.tabBarHeight + bottomGap + glow.blurRadius;

  // Precomputed in JS render scope so the worklet only ever calls the true
  // worklets `withSpring` / `withTiming` with plain, token-sourced configs — the
  // gentle spring for the slide, and the sanctioned reduced-motion fade (same
  // `reducedFadeMs` + `tokenEasing` that `lib/motion.fadeTiming` uses).
  const gentleSpring = springFromToken('gentle');
  const reducedFade = { duration: motion.durations.reducedFadeMs, easing: tokenEasing };

  const containerStyle = useAnimatedStyle(() => {
    // No provider (e.g. design lab host) → always shown, no motion. `box-none`
    // lets taps fall through the gaps between tabs to content below; `none` while
    // hidden so the off-screen / faded bar can't catch touches.
    if (!visible) {
      return { transform: [{ translateY: 0 }], opacity: 1, pointerEvents: 'box-none' };
    }
    const shown = visible.value > 0.5;
    if (reduced) {
      // Reduced motion: fade opacity toward the target instead of sliding.
      return {
        transform: [{ translateY: 0 }],
        opacity: withTiming(visible.value, reducedFade),
        pointerEvents: shown ? 'box-none' : 'none',
      };
    }
    return {
      opacity: 1,
      transform: [{ translateY: withSpring((1 - visible.value) * hiddenTravel, gentleSpring) }],
      pointerEvents: shown ? 'box-none' : 'none',
    };
  });

  return (
    <Animated.View
      style={[
        styles.container,
        {
          bottom: bottomGap,
          left: spacing.s4,
          right: spacing.s4,
          height: layout.tabBarHeight,
        },
        containerStyle,
      ]}
    >
      <GlassPanel radius={radii.full} shadow="e4" style={StyleSheet.absoluteFill} />
      <View style={styles.row}>
        {TABS.map((tab) => {
          const isActive = tab.key === active;
          return (
            <Press
              key={tab.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={tab.label}
              style={styles.tab}
              onPress={() => onChange(tab.key)}
            >
              <Text
                variant="ui"
                size="footnote"
                weight={isActive ? 600 : 400}
                color={isActive ? colors.text : colors.secondaryStrong}
              >
                {tab.label}
              </Text>
              {/* The dot's slot is always reserved (height DOT + gap); only the
                  active tab paints the accent glow into it, so labels never jump. */}
              <View style={styles.dotSlot}>
                {isActive ? (
                  <View
                    style={[
                      styles.dot,
                      {
                        backgroundColor: colors.accent,
                        shadowColor: colors.accent,
                        shadowOpacity: glow.opacity[resolved],
                        shadowRadius: glow.blurRadius / 2,
                      },
                    ]}
                  />
                ) : null}
              </View>
            </Press>
          );
        })}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    // The glow/e4 shadow must render past the pill's edge, so the wrapper does NOT
    // clip — only the GlassPanel inside owns overflow:hidden for its rounded blur.
    borderCurve: 'continuous',
  },
  row: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s1,
  },
  dotSlot: {
    height: DOT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: radii.full,
    // iOS accent glow: a centred, accent-tinted shadow (Android shows the flat dot).
    shadowOffset: { width: 0, height: 0 },
  },
});
