/**
 * AngleViewer — the swipe-through multi-angle "dimensional" view of a piece.
 *
 * Replaces the static hero on the item detail WHEN turnaround renders exist. The
 * pages read as a rotation: the straight-on cutout first, then the accepted
 * three-quarter / side / back renders in the frozen {@link TURNAROUND_ANGLES}
 * order (missing angles skipped) — composed by the pure `composeAnglePages`.
 *
 * Implementation is a native `Animated.ScrollView` with `pagingEnabled` + snap,
 * NOT a reanimated worklet pan pager: a 2–4 image carousel inside a sheet has no
 * gesture nuance a worklet buys, and native paging is already 60fps. A scroll-
 * driven cross-parallax (the image drifts opposite the swipe) adds the subtle
 * dimensional read; under reduced motion the parallax is dropped and programmatic
 * scrolls snap instantly. Quiet page dots track position (tokens-only). The whole
 * pager is one VoiceOver `adjustable` control: swipe up/down increments/decrements
 * the page and each settle announces the angle via `strings.turnaround.angleLabel`
 * ("Front view" for the cutout). Every colour/space is from tokens.
 */
import { strings } from '@era/core/strings';
import { type TurnaroundRender } from '@era/core/turnaround';
import { layout, radii, spacing } from '@era/tokens';
import { Image } from 'expo-image';
import { useCallback, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  StyleSheet,
  View,
  type AccessibilityActionEvent,
  type LayoutChangeEvent,
  type ScrollView,
} from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';

import { useReducedMotionSafe } from '@/lib/motion';
import { useTheme } from '@/lib/theme';
import { composeAnglePages, type AngleViewerPage } from '@/lib/turnaround-pages';

/** How far the image drifts against the swipe — the parallax depth cue (0 = flat). */
const PARALLAX = spacing.s4;

interface AngleViewerProps {
  /** The straight-on cutout URL — the first page (the existing hero image). */
  readonly frontUrl: string;
  /** The accepted turnaround renders; ordered + missing-angle-skipped internally. */
  readonly renders: readonly TurnaroundRender[];
}

/** The plain VoiceOver name for a page — "Front view" for the cutout, else the angle. */
function pageLabel(page: AngleViewerPage): string {
  return page.angle === 'front' ? 'Front view' : strings.turnaround.angleLabel(page.angle);
}

export function AngleViewer({ frontUrl, renders }: AngleViewerProps) {
  const { colors } = useTheme();
  const reduced = useReducedMotionSafe();
  const scrollRef = useRef<ScrollView>(null);

  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const scrollX = useSharedValue(0);

  const pages = composeAnglePages(frontUrl, renders);
  const lastIndex = Math.max(0, pages.length - 1);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    setWidth(event.nativeEvent.layout.width);
  }, []);

  const scrollHandler = useAnimatedScrollHandler((event) => {
    scrollX.value = event.contentOffset.x;
  });

  const settle = useCallback(
    (offsetX: number) => {
      if (width <= 0) return;
      const next = Math.round(offsetX / width);
      setIndex((current) => {
        if (next !== current && pages[next]) {
          AccessibilityInfo.announceForAccessibility(pageLabel(pages[next]));
        }
        return next;
      });
    },
    [width, pages],
  );

  const goToIndex = useCallback(
    (target: number) => {
      const clamped = Math.min(lastIndex, Math.max(0, target));
      scrollRef.current?.scrollTo({ x: clamped * width, animated: !reduced });
      setIndex(clamped);
      if (pages[clamped]) AccessibilityInfo.announceForAccessibility(pageLabel(pages[clamped]));
    },
    [lastIndex, width, reduced, pages],
  );

  const onAccessibilityAction = useCallback(
    (event: AccessibilityActionEvent) => {
      if (event.nativeEvent.actionName === 'increment') goToIndex(index + 1);
      else if (event.nativeEvent.actionName === 'decrement') goToIndex(index - 1);
    },
    [goToIndex, index],
  );

  return (
    <View
      style={styles.root}
      onLayout={onLayout}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={pages[index] ? pageLabel(pages[index]) : 'Front view'}
      accessibilityValue={{ min: 1, max: pages.length, now: index + 1 }}
      accessibilityActions={ACCESSIBILITY_ACTIONS}
      onAccessibilityAction={onAccessibilityAction}
    >
      {width > 0 ? (
        <>
          <View
            style={[
              styles.card,
              { width, backgroundColor: colors.surface, borderColor: colors.hairline },
            ]}
          >
            <Animated.ScrollView
              ref={scrollRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onScroll={scrollHandler}
              scrollEventThrottle={16}
              onMomentumScrollEnd={(event) => settle(event.nativeEvent.contentOffset.x)}
              style={{ width }}
              importantForAccessibility="no-hide-descendants"
              accessibilityElementsHidden
            >
              {pages.map((page, pageIndex) => (
                <AnglePage
                  key={page.key}
                  page={page}
                  width={width}
                  index={pageIndex}
                  scrollX={scrollX}
                  parallax={reduced ? 0 : PARALLAX}
                />
              ))}
            </Animated.ScrollView>
          </View>

          {pages.length > 1 ? (
            <View style={styles.dots}>
              {pages.map((page, dotIndex) => (
                <View
                  key={page.key}
                  style={[
                    styles.dot,
                    { backgroundColor: dotIndex === index ? colors.accent : colors.hairline },
                  ]}
                />
              ))}
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

interface AnglePageProps {
  readonly page: AngleViewerPage;
  readonly width: number;
  readonly index: number;
  readonly scrollX: SharedValue<number>;
  /** Parallax drift in px; 0 flattens it (reduced motion). */
  readonly parallax: number;
}

function AnglePage({ page, width, index, scrollX, parallax }: AnglePageProps) {
  const innerStyle = useAnimatedStyle(() => {
    if (parallax === 0) return { transform: [{ translateX: 0 }] };
    const translateX = interpolate(
      scrollX.value,
      [(index - 1) * width, index * width, (index + 1) * width],
      [parallax, 0, -parallax],
      Extrapolation.CLAMP,
    );
    return { transform: [{ translateX }] };
  });

  return (
    <View style={[styles.page, { width }]}>
      <Animated.View style={[styles.pageInner, innerStyle]}>
        <Image
          source={{ uri: page.displayUrl }}
          style={styles.image}
          contentFit="contain"
          accessible={false}
        />
      </Animated.View>
    </View>
  );
}

/** Static so it isn't reallocated each render (VoiceOver swipe-up/down actions). */
const ACCESSIBILITY_ACTIONS = [{ name: 'increment' }, { name: 'decrement' }] as const;

const styles = StyleSheet.create({
  root: {
    gap: spacing.s3,
  },
  card: {
    borderRadius: radii.hero,
    borderWidth: StyleSheet.hairlineWidth,
    borderCurve: 'continuous',
    paddingVertical: spacing.s4,
    overflow: 'hidden',
  },
  page: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.s4,
  },
  pageInner: {
    width: '100%',
  },
  image: {
    width: '100%',
    aspectRatio: layout.itemCard.ratio,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.s2,
  },
  dot: {
    width: spacing.s2,
    height: spacing.s2,
    borderRadius: radii.chip,
  },
});
