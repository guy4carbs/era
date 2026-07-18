/**
 * FpsOverlay — the 60fps instrument for the TestFlight checkpoint.
 *
 * Two independent meters: the UI thread (reanimated `useFrameCallback`, where the
 * pager's swipe worklet runs — the number that must hold ≥55) and the JS thread
 * (a `requestAnimationFrame` loop — the pagination/prefetch thread, target ≥50).
 * Each accumulates frames over a 500ms window and reports the window fps plus the
 * minimum of the last ~1s (two windows), so a single dropped-frame stutter is
 * visible, not averaged away.
 *
 * Gated to dev + explicitly-flagged preview builds (`EXPO_PUBLIC_ERA_FEED_FPS`),
 * since a store `preview` build is Release (so `__DEV__` is false). The outer
 * component is hook-free so the gate can early-return before any hooks run.
 */
import { spacing, palette } from '@era/tokens';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { runOnJS, useFrameCallback, useSharedValue } from 'react-native-reanimated';

import { Text } from '@/components/Text';

/** Show for dev builds, or any build given EXPO_PUBLIC_ERA_FEED_FPS=true (preview). */
const SHOW = __DEV__ || process.env.EXPO_PUBLIC_ERA_FEED_FPS === 'true';

/** The window over which each meter accumulates before reporting. */
const FLUSH_MS = 500;
const ON_IMAGE = palette.white;

export function FpsOverlay() {
  if (!SHOW) return null;
  return <FpsMeter />;
}

/** Track a fps window value and return the min of the last ~1s (two windows). */
function useWindowedMin(): { push: (fps: number) => void; last: number; min: number } {
  const [last, setLast] = useState(0);
  const [min, setMin] = useState(0);
  const windowsRef = useRef<number[]>([]);
  const push = useCallback((fps: number) => {
    const rounded = Math.round(fps);
    setLast(rounded);
    const windows = [...windowsRef.current, rounded].slice(-2);
    windowsRef.current = windows;
    setMin(Math.min(...windows));
  }, []);
  return { push, last, min };
}

function FpsMeter() {
  const insets = useSafeAreaInsets();
  const ui = useWindowedMin();
  const js = useWindowedMin();

  // UI thread: count frames + elapsed on the worklet; flush every FLUSH_MS.
  const frames = useSharedValue(0);
  const elapsed = useSharedValue(0);
  const pushUi = ui.push;
  useFrameCallback((frame) => {
    'worklet';
    frames.value += 1;
    elapsed.value += frame.timeSincePreviousFrame ?? 0;
    if (elapsed.value >= FLUSH_MS) {
      runOnJS(pushUi)((frames.value * 1000) / elapsed.value);
      frames.value = 0;
      elapsed.value = 0;
    }
  }, true);

  // JS thread: a plain rAF loop measured off the frame timestamp.
  const pushJs = js.push;
  useEffect(() => {
    let raf = 0;
    let count = 0;
    let start = 0;
    const loop = (t: number) => {
      if (start === 0) start = t;
      count += 1;
      const dt = t - start;
      if (dt >= FLUSH_MS) {
        pushJs((count * 1000) / dt);
        count = 0;
        start = t;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [pushJs]);

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.overlay, { top: insets.top + spacing.s2 }]}
    >
      <Text variant="caption" weight={600} color={ON_IMAGE} style={styles.line}>
        UI {ui.last} (min {ui.min})
      </Text>
      <Text variant="caption" weight={600} color={ON_IMAGE} style={styles.line}>
        JS {js.last} (min {js.min})
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    right: spacing.s2,
    paddingVertical: spacing.s1,
    paddingHorizontal: spacing.s2,
    borderRadius: spacing.s1,
    backgroundColor: 'rgba(28, 27, 25, 0.6)',
    gap: 2,
  },
  line: {
    fontVariant: ['tabular-nums'],
  },
});
