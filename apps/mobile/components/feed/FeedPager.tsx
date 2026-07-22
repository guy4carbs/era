/**
 * FeedPager — a custom reanimated vertical pager. NOT a FlatList/FlashList: a
 * 1-cell-per-screen feed has no recycling problem to solve, and the 60fps
 * requirement means the swipe must do ZERO JS-thread work. So the swipe lives
 * entirely in a worklet: one `Animated.View` translates, exactly three cards
 * (current ± 1) are mounted, and `runOnJS` fires only ONCE per settle (to move the
 * index, trigger pagination, and prefetch the next covers).
 *
 * Gesture composition (per the plan): `Race(pan, Exclusive(doubleTap, singleTap))`.
 * The pan claims only a vertical-dominant drag (`activeOffsetY ±10`, `failOffsetX`),
 * so taps fall through to the card chrome. Settle = `|velocityY| > 500` or past the
 * half-page line; the spring is `motion.springs.fluid`, velocity-seeded, clamped to
 * one page per gesture, rubber-banded ×0.55 at the ends. Double-tap likes (never
 * unlikes) with a worklet heart burst + light haptic; reduced motion swaps the
 * spring for a 150ms timing and drops the burst. VoiceOver drives it via the
 * `adjustable` role's increment/decrement actions.
 *
 * The page height is the container's own `onLayout` height — the tab bar is in the
 * normal flow, so that height already excludes it (no OviFab/tab-bar math here).
 */
import { strings } from '@era/core/strings';
import { motion, palette, spacing } from '@era/tokens';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  StyleSheet,
  View,
  type AccessibilityActionEvent,
  type LayoutChangeEvent,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Text } from '@/components/Text';
import { FailedLoad } from '@/components/FailedLoad';
import { OviLoader } from '@/components/OviLoader';
import { springFromToken, tokenEasing, useReducedMotionSafe } from '@/lib/motion';
import { useTheme } from '@/lib/theme';
import { isHidden, type FeedSlot } from '@/lib/feed-store';

import { FeedCard } from './FeedCard';
import { PREFETCH_THRESHOLD, USE_FIXTURES, useFeed } from './FeedProvider';

const ON_IMAGE = palette.white;
/** Past this drag distance OR velocity, the swipe settles to the next page. */
const VELOCITY_THRESHOLD = 500;
/** Overscroll resistance at the first/last page. */
const RUBBER = 0.55;

function clampWorklet(value: number, lo: number, hi: number): number {
  'worklet';
  return Math.min(hi, Math.max(lo, value));
}

export function FeedPager() {
  const { colors } = useTheme();
  const feed = useFeed();
  const reduced = useReducedMotionSafe();

  const [pageHeight, setPageHeight] = useState(0);
  const [index, setIndex] = useState(0);

  const posts = feed.posts;
  const lastIndex = Math.max(0, posts.length - 1);

  // Refs the JS-thread settle callbacks read (latest posts + index, no rebind).
  const postsRef = useRef<readonly FeedSlot[]>(posts);
  postsRef.current = posts;
  const indexRef = useRef(index);
  indexRef.current = index;

  // Shared values the worklet reads so the gesture is built once, not per render.
  const offset = useSharedValue(0); // the live translateY of the page column
  const start = useSharedValue(0); // offset captured at gesture start
  const indexSV = useSharedValue(0);
  const lastIndexSV = useSharedValue(0);
  const phSV = useSharedValue(0);
  const reducedSV = useSharedValue(false);
  const burstScale = useSharedValue(0);
  const burstOpacity = useSharedValue(0);

  useEffect(() => {
    indexSV.value = index;
  }, [index, indexSV]);
  useEffect(() => {
    lastIndexSV.value = lastIndex;
  }, [lastIndex, lastIndexSV]);
  useEffect(() => {
    reducedSV.value = reduced;
  }, [reduced, reducedSV]);
  // Resync the column to the current page whenever the layout height changes.
  useEffect(() => {
    phSV.value = pageHeight;
    offset.value = -indexRef.current * pageHeight;
  }, [pageHeight, phSV, offset]);

  // Spring configs precomputed on the JS thread, then captured by the worklets.
  const fluidSpring = useMemo(() => springFromToken('fluid'), []);
  const snappySpring = useMemo(() => springFromToken('snappy'), []);

  /** Prefetch the covers of the next two posts beyond `target`. */
  const prefetchAhead = useCallback((target: number) => {
    const list = postsRef.current;
    const urls: string[] = [];
    for (let k = target + 1; k <= target + 2 && k < list.length; k += 1) {
      const slot = list[k];
      if (slot && !isHidden(slot) && slot.coverUrl) urls.push(slot.coverUrl);
    }
    if (urls.length > 0) void Image.prefetch(urls);
  }, []);

  /** One settle: move the React index, page ahead if near the end, prefetch. */
  const commitIndex = useCallback(
    (target: number) => {
      setIndex(target);
      if (!USE_FIXTURES && target >= postsRef.current.length - PREFETCH_THRESHOLD) {
        feed.loadMore();
      }
      prefetchAhead(target);
    },
    [feed, prefetchAhead],
  );

  /** Double-tap: like-only (never unlike) + a light haptic. */
  const doubleTapLike = useCallback(() => {
    const slot = postsRef.current[indexRef.current];
    if (!slot || isHidden(slot)) return;
    feed.likeOnly(slot);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [feed]);

  /** Animate to a page (accessibility + programmatic). Reduced motion → 150ms fade. */
  const goToIndex = useCallback(
    (target: number) => {
      const clamped = Math.min(lastIndex, Math.max(0, target));
      offset.value = reduced
        ? withTiming(-clamped * pageHeight, { duration: motion.durations.reducedFadeMs })
        : withSpring(-clamped * pageHeight, fluidSpring);
      commitIndex(clamped);
    },
    [lastIndex, pageHeight, reduced, offset, fluidSpring, commitIndex],
  );

  const onAccessibilityAction = useCallback(
    (event: AccessibilityActionEvent) => {
      if (event.nativeEvent.actionName === 'increment') goToIndex(indexRef.current + 1);
      else if (event.nativeEvent.actionName === 'decrement') goToIndex(indexRef.current - 1);
    },
    [goToIndex],
  );

  const gesture = useMemo(() => {
    const pan = Gesture.Pan()
      .activeOffsetY([-10, 10])
      .failOffsetX([-10, 10])
      .onStart(() => {
        start.value = offset.value;
      })
      .onUpdate((event) => {
        const ph = phSV.value;
        const atTop = indexSV.value === 0;
        const atEnd = indexSV.value === lastIndexSV.value;
        let dy = event.translationY;
        // Rubber-band an overscroll at either end.
        if ((atTop && dy > 0) || (atEnd && dy < 0)) dy *= RUBBER;
        // Never travel more than one page within a single gesture.
        dy = clampWorklet(dy, -ph, ph);
        offset.value = start.value + dy;
      })
      .onEnd((event) => {
        const ph = phSV.value;
        const dy = offset.value - start.value;
        const passed = Math.abs(event.velocityY) > VELOCITY_THRESHOLD || Math.abs(dy) > ph / 2;
        let target = indexSV.value;
        if (passed && dy < 0 && indexSV.value < lastIndexSV.value) target = indexSV.value + 1;
        else if (passed && dy > 0 && indexSV.value > 0) target = indexSV.value - 1;

        offset.value = reducedSV.value
          ? withTiming(-target * ph, { duration: motion.durations.reducedFadeMs })
          : withSpring(-target * ph, { ...fluidSpring, velocity: event.velocityY });
        runOnJS(commitIndex)(target);
      });

    const doubleTap = Gesture.Tap()
      .numberOfTaps(2)
      .maxDuration(300)
      .onStart(() => {
        if (!reducedSV.value) {
          burstScale.value = 0.4;
          burstScale.value = withSpring(1.3, snappySpring);
          burstOpacity.value = 0;
          // Heart burst: a quick fade-in, then a fade-out capped at the 350ms
          // ceiling. Both legs carry the token easing.
          burstOpacity.value = withSequence(
            withTiming(1, { duration: motion.durations.reducedFadeMs, easing: tokenEasing }),
            withTiming(0, { duration: motion.durations.maxMs, easing: tokenEasing }),
          );
        }
        runOnJS(doubleTapLike)();
      });

    // A no-op single tap so Exclusive can disambiguate it from the double tap.
    const singleTap = Gesture.Tap().numberOfTaps(1);

    return Gesture.Race(pan, Gesture.Exclusive(doubleTap, singleTap));
  }, [
    offset,
    start,
    phSV,
    indexSV,
    lastIndexSV,
    reducedSV,
    burstScale,
    burstOpacity,
    fluidSpring,
    snappySpring,
    commitIndex,
    doubleTapLike,
  ]);

  const columnStyle = useAnimatedStyle(() => ({ transform: [{ translateY: offset.value }] }));
  const burstStyle = useAnimatedStyle(() => ({
    opacity: burstOpacity.value,
    transform: [{ scale: burstScale.value }],
  }));

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    setPageHeight(event.nativeEvent.layout.height);
  }, []);

  // Empty / loading / error states before the pager has content to page through.
  if (posts.length === 0) {
    return (
      <View style={[styles.fill, styles.centered, { backgroundColor: colors.bg }]} onLayout={onLayout}>
        {feed.status === 'error' ? (
          <FailedLoad onRetry={feed.loadMore} />
        ) : feed.status === 'end' ? (
          <Text variant="body" color={colors.secondaryStrong} style={styles.stateText}>
            {strings.feed.empty}
          </Text>
        ) : (
          <OviLoader variant="page" />
        )}
      </View>
    );
  }

  // The three-card window around the current index, keyed by post id.
  const window = [index - 1, index, index + 1].filter((k) => k >= 0 && k <= lastIndex);

  return (
    <View style={[styles.fill, { backgroundColor: colors.bg }]} onLayout={onLayout}>
      {pageHeight > 0 ? (
        <GestureDetector gesture={gesture}>
          <Animated.View
            style={styles.fill}
            accessibilityRole="adjustable"
            accessibilityValue={{ min: 1, max: posts.length, now: index + 1 }}
            accessibilityActions={ACCESSIBILITY_ACTIONS}
            onAccessibilityAction={onAccessibilityAction}
          >
            <Animated.View style={[StyleSheet.absoluteFill, columnStyle]}>
              {window.map((k) => {
                const slot = posts[k]!;
                return (
                  <View key={slot.id} style={[styles.pageSlot, { top: k * pageHeight, height: pageHeight }]}>
                    <FeedCard slot={slot} height={pageHeight} priority={k === index ? 'high' : 'low'} />
                  </View>
                );
              })}
            </Animated.View>

            {/* Double-tap heart burst — a single centered overlay (double-tap is
                always on the current page). Held invisible until triggered. */}
            <Animated.View pointerEvents="none" style={[styles.burst, burstStyle]}>
              <Text variant="ui" size={96} color={ON_IMAGE} style={styles.burstHeart}>
                ♥
              </Text>
            </Animated.View>
          </Animated.View>
        </GestureDetector>
      ) : null}
    </View>
  );
}

/** Static so it isn't reallocated each render (VoiceOver swipe-up/down actions). */
const ACCESSIBILITY_ACTIONS = [{ name: 'increment' }, { name: 'decrement' }] as const;

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorBox: {
    alignItems: 'center',
    gap: spacing.s4,
    paddingHorizontal: spacing.s8,
  },
  stateText: {
    textAlign: 'center',
  },
  pageSlot: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  burst: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  burstHeart: {
    textShadowColor: 'rgba(28, 27, 25, 0.35)',
    textShadowRadius: 12,
  },
});
