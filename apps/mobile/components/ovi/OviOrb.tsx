/**
 * OviOrb — Ovi's living presence. A character, not a button.
 *
 * A dimensional sphere that replaces the flat accent circle everywhere Ovi
 * appears: a radial warm-cream core (surface → bg) inside a 1px taupe rim, lit
 * by a 1px highlight arc up top, carrying the §3 accent glow (a tinted, centred
 * iOS shadow). Three sizes come from the `orb` token (corner / header / panel);
 * a `sizePx` override is accepted for the legacy closet greeting.
 *
 * Three states, springs/timing only:
 *   IDLE     — breathing: scale 1.0 ↔ 1.0 + breath.scaleAmount plus the glow
 *              opacity pulse, on the shared 3s heartbeat.
 *   THINKING — the glow shimmer rotates once per shimmer.rotateMs while the
 *              breath quickens to breath.thinkingMs.
 *   SPEAKING — a gentle pulse on the speaking cadence while a reply lands.
 *
 * `leanX`/`leanY` (shared values, -1..1) lean the orb lean.px toward a pointer
 * on the fluid spring — the FAB feeds them its press point. Reduced motion pins
 * a static orb: breath/shimmer/pulse frozen, glow held at base opacity, no lean.
 *
 * HARD LAWS honoured: no sensors (nothing here mounts useAnimatedSensor); every
 * side-effect write to a shared value lives in an effect or a frame callback —
 * never inside useDerivedValue. Loops use withRepeat(withTiming(...), -1, true),
 * the OviFab/closet-orb pattern.
 */
import { glow, orb as orbToken, palette } from '@era/tokens';
import { useEffect } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { tokenEasing, useReducedMotionSafe } from '@/lib/motion';
import { useTheme } from '@/lib/theme';

export type OviOrbState = 'idle' | 'thinking' | 'speaking';

interface OviOrbProps {
  /** State drives breath cadence, shimmer, and the speaking pulse. */
  readonly state?: OviOrbState;
  /** One of the three canonical token sizes. Ignored when `sizePx` is set. */
  readonly size?: keyof typeof orbToken.size;
  /** Explicit diameter override (the closet greeting keeps its own size). */
  readonly sizePx?: number;
  /**
   * Lean offsets in px (already spring-driven by the caller — the FAB springs
   * these toward its press point on onPressIn and back to 0 on release). Read
   * raw here and applied as a translate; omitted ⇒ no lean.
   */
  readonly leanX?: SharedValue<number>;
  readonly leanY?: SharedValue<number>;
  readonly style?: StyleProp<ViewStyle>;
}

export function OviOrb({ state = 'idle', size = 'cornerPx', sizePx, leanX, leanY, style }: OviOrbProps) {
  const { colors, resolved } = useTheme();
  const reduced = useReducedMotionSafe();

  const diameter = sizePx ?? orbToken.size[size];
  const baseGlowOpacity = glow.opacity[resolved];

  // Ambient loops. `breath` 0→1→0 (the idle/thinking heartbeat), `shimmer` 0→1
  // (a full rotation while THINKING), `speak` 0→1→0 (the reply pulse). All are
  // written only from effects below — never from a derived value.
  const breath = useSharedValue(0);
  const shimmer = useSharedValue(0);
  const speak = useSharedValue(0);

  // Breathing: quicker under THINKING, otherwise the shared 3s idle heartbeat.
  useEffect(() => {
    if (reduced) {
      breath.value = 0;
      return;
    }
    const period = state === 'thinking' ? orbToken.breath.thinkingMs : orbToken.breath.idleMs;
    breath.value = withRepeat(
      withTiming(1, { duration: period / 2, easing: tokenEasing }),
      -1,
      true,
    );
  }, [reduced, state, breath]);

  // Shimmer: one slow revolution of the glow layer while THINKING; parked at 0
  // otherwise (a fresh 0→1 loop each time THINKING is entered).
  useEffect(() => {
    if (reduced || state !== 'thinking') {
      shimmer.value = 0;
      return;
    }
    shimmer.value = withRepeat(
      withTiming(1, { duration: orbToken.shimmer.rotateMs, easing: tokenEasing }),
      -1,
      false,
    );
  }, [reduced, state, shimmer]);

  // Speaking: a gentle pulse loop while the reply lands, off otherwise.
  useEffect(() => {
    if (reduced || state !== 'speaking') {
      speak.value = 0;
      return;
    }
    speak.value = withRepeat(
      withTiming(1, { duration: orbToken.speaking.pulseMs / 2, easing: tokenEasing }),
      -1,
      true,
    );
  }, [reduced, state, speak]);

  // The sphere: breath + speak scale together (never at once — only one loop
  // runs per state), the glow opacity rides the active pulse, and the lean
  // nudges the whole orb toward the pointer on the fluid spring.
  const orbStyle = useAnimatedStyle(() => {
    const breatheScale = 1 + breath.value * orbToken.breath.scaleAmount;
    const speakScale = 1 + speak.value * orbToken.speaking.scaleAmount;
    const pulse = Math.max(breath.value, speak.value);
    const tx = leanX ? leanX.value : 0;
    const ty = leanY ? leanY.value : 0;
    return {
      transform: [{ translateX: tx }, { translateY: ty }, { scale: breatheScale * speakScale }],
      shadowOpacity: interpolate(
        pulse,
        [0, 1],
        [baseGlowOpacity, baseGlowOpacity * (1 + glow.pulse.amount)],
      ),
    };
  });

  // The shimmer layer rotates a full turn over shimmer.rotateMs while THINKING.
  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${shimmer.value * 360}deg` }],
  }));

  // 1px highlight arc: a circle whose only-lit top border reads as a lit crest.
  const rimWidth = orbToken.rim.widthPx;
  const highlightWidth = orbToken.highlight.widthPx;

  return (
    // Outer carrier: breathes (scale) + leans (translate) and paints the glow.
    // It must NOT clip — the tinted shadow renders outside the bounds, and an
    // `overflow:'hidden'` here would crop the glow. The inner sphere clips.
    <Animated.View
      style={[
        styles.glow,
        {
          width: diameter,
          height: diameter,
          borderRadius: diameter / 2,
          shadowColor: colors.accent,
          shadowRadius: glow.blurRadius,
        },
        orbStyle,
        style,
      ]}
    >
      {/* The clipped sphere: taupe rim, cream core floor, gradient, shimmer, arc. */}
      <View
        style={[
          styles.sphere,
          {
            borderRadius: diameter / 2,
            borderWidth: rimWidth,
            borderColor: colors.accent, // the taupe rim
            backgroundColor: colors.bg, // core floor, beneath the gradient
          },
        ]}
      >
        {/* Dimensional core: a diagonal surface → bg wash reads as a lit sphere. */}
        <LinearGradient
          colors={[colors.surface, colors.bg]}
          start={{ x: 0.3, y: 0.15 }}
          end={{ x: 0.7, y: 1 }}
          style={StyleSheet.absoluteFill}
        />

        {/* Shimmer: a faint accent wash that rotates only while THINKING. */}
        <Animated.View style={[StyleSheet.absoluteFill, shimmerStyle]} pointerEvents="none">
          <LinearGradient
            colors={[colors.accent, 'transparent', 'transparent']}
            locations={[0, 0.5, 1]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={[StyleSheet.absoluteFill, { opacity: 0.35 }]}
          />
        </Animated.View>

        {/* Highlight arc: a concentric ring lit only along its top-left edge. */}
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            borderRadius: diameter / 2,
            borderTopWidth: highlightWidth,
            borderLeftWidth: highlightWidth,
            borderRightWidth: 0,
            borderBottomWidth: 0,
            borderColor: 'transparent',
            borderTopColor: palette.white,
            borderLeftColor: palette.white,
            opacity: orbToken.highlight.opacity,
            transform: [{ rotate: '-35deg' }],
          }}
        />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  glow: {
    alignItems: 'center',
    justifyContent: 'center',
    // iOS glow: a coloured, centred shadow. Android shows no tinted glow. No
    // overflow clip here — clipping would crop the shadow.
    shadowOffset: { width: 0, height: 0 },
  },
  sphere: {
    width: '100%',
    height: '100%',
    overflow: 'hidden',
  },
});
