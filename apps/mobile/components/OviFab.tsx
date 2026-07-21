/**
 * OviFab — the floating trigger for Ovi, the AI stylist. Not a button: the
 * living {@link OviOrb} at corner size, breathing above the tab bar.
 *
 * The orb IS Ovi's identity — no glyph. It reflects Ovi's shared living state
 * (idle / thinking / speaking) so the corner presence shimmers while the panel
 * thinks and pulses while a reply lands. Press keeps the existing grammar: a
 * snappy press-scale + a Light haptic, plus a small lean toward the touch point
 * on the fluid spring. Reduced motion pins it static (handled inside the orb).
 *
 * First session only, a serif-accent tooltip — "Ovi, your stylist" — surfaces
 * beside the FAB and auto-dismisses after a few seconds or on first open
 * (AsyncStorage `era-ovi-orb-tip-seen`, the feed REVEAL_SEEN_KEY pattern). It is
 * static under reduced motion.
 */
import { layout, motion as motionTokens, orb as orbToken, radii, spacing } from '@era/tokens';
import { strings } from '@era/core/strings';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  type GestureResponderEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { OviOrb } from '@/components/ovi/OviOrb';
import { useOviState } from '@/components/ovi/OviState';
import { Text } from '@/components/Text';
import { PRESS_SCALE, animate, springFromToken, useReducedMotionSafe } from '@/lib/motion';
import { useTheme } from '@/lib/theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const DIAMETER = layout.touchTarget.ios; // 44 = orb.size.cornerPx
const REST_SCALE = 1;

/** First-session gate for the "Ovi, your stylist" tooltip. */
const TIP_SEEN_KEY = 'era-ovi-orb-tip-seen';
/** How long the tooltip lingers before it self-dismisses. */
const TIP_LINGER_MS = 4200;

interface OviFabProps {
  readonly onPress?: () => void;
  readonly style?: StyleProp<ViewStyle>;
}

export function OviFab({ onPress, style }: OviFabProps) {
  const { colors } = useTheme();
  const reduced = useReducedMotionSafe();
  const { state } = useOviState();

  const press = useSharedValue(REST_SCALE);
  // Lean offset in px, spring-driven toward the press point and back to 0. The
  // orb reads these raw and translates by them.
  const leanX = useSharedValue(0);
  const leanY = useSharedValue(0);

  // First-session tooltip: `null` while the seen-flag hydrates (hold, never
  // flash on a returning visit), then true only if it has never been seen.
  const [showTip, setShowTip] = useState<boolean | null>(null);
  const tipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(TIP_SEEN_KEY).then((seen) => {
      if (active) setShowTip(seen === null);
    });
    return () => {
      active = false;
      if (tipTimer.current) clearTimeout(tipTimer.current);
    };
  }, []);

  const dismissTip = () => {
    if (showTip !== true) return;
    setShowTip(false);
    void AsyncStorage.setItem(TIP_SEEN_KEY, 'true');
    if (tipTimer.current) {
      clearTimeout(tipTimer.current);
      tipTimer.current = null;
    }
  };

  // Auto-dismiss after a few seconds once the tooltip is actually showing.
  useEffect(() => {
    if (showTip !== true) return;
    tipTimer.current = setTimeout(() => {
      setShowTip(false);
      void AsyncStorage.setItem(TIP_SEEN_KEY, 'true');
    }, TIP_LINGER_MS);
    return () => {
      if (tipTimer.current) clearTimeout(tipTimer.current);
    };
  }, [showTip]);

  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: press.value }],
  }));

  const leanTo = (event: GestureResponderEvent) => {
    if (reduced) return;
    // Sign of the touch position within the orb → lean toward the pointer, clamped
    // to lean.px. locationX/Y are relative to the pressable (0..DIAMETER).
    const { locationX, locationY } = event.nativeEvent;
    const dx = Math.sign(locationX - DIAMETER / 2);
    const dy = Math.sign(locationY - DIAMETER / 2);
    leanX.value = withSpring(dx * orbToken.lean.px, springFromToken('fluid'));
    leanY.value = withSpring(dy * orbToken.lean.px, springFromToken('fluid'));
  };

  const leanBack = () => {
    leanX.value = withSpring(0, springFromToken('fluid'));
    leanY.value = withSpring(0, springFromToken('fluid'));
  };

  return (
    <View style={[styles.wrap, style]} pointerEvents="box-none">
      {showTip === true ? (
        <Animated.View
          entering={reduced ? undefined : FadeIn.duration(motionTokens.durations.minMs)}
          exiting={reduced ? undefined : FadeOut.duration(motionTokens.durations.minMs)}
          pointerEvents="none"
          style={[
            styles.tip,
            { backgroundColor: colors.surface, borderColor: colors.hairline, borderRadius: radii.card },
          ]}
        >
          <Text variant="oviAccent" size="subhead" color={colors.text}>
            {strings.ovi.fabLabel}
          </Text>
        </Animated.View>
      ) : null}

      <AnimatedPressable
        accessibilityRole="button"
        accessibilityLabel={strings.ovi.fabLabel}
        onPressIn={(event) => {
          press.value = animate(PRESS_SCALE, reduced, 'snappy');
          leanTo(event);
        }}
        onPressOut={() => {
          press.value = animate(REST_SCALE, reduced, 'snappy');
          leanBack();
        }}
        onPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          dismissTip();
          onPress?.();
        }}
        style={pressStyle}
      >
        <OviOrb state={state} size="cornerPx" leanX={leanX} leanY={leanY} />
      </AnimatedPressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    alignItems: 'flex-end',
  },
  tip: {
    marginBottom: spacing.s2,
    paddingVertical: spacing.s1,
    paddingHorizontal: spacing.s2,
    borderWidth: StyleSheet.hairlineWidth,
    borderCurve: 'continuous',
  },
});
