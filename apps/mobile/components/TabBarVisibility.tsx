/**
 * TabBarVisibility — shared scroll-driven show/hide state for the floating TabBar.
 *
 * The floating pill hides when the user scrolls DOWN into content and returns on
 * scroll UP, so reading a long list gets the full screen. This context owns the
 * single reanimated `visible` shared value (1 shown / 0 hidden) that the TabBar
 * animates against, plus a scroll-handler factory each tab screen wires into its
 * list's `onScroll`.
 *
 * Direction detection is delta-accumulated with a jitter threshold: small wobbles
 * don't flip the bar; only a sustained ~12px drag in one direction does. The bar
 * always shows near the top (offset < NEAR_TOP_PX) and iOS rubber-band (negative
 * offset / bounce past the end) is clamped so the overscroll can't flicker it.
 *
 * Owned by `app/(tabs)/_layout.tsx`; `show()` is called on every tab change so a
 * screen that was left hidden re-reveals the bar when you come back to it. Feed's
 * gesture pager doesn't scroll a list, so it simply never wires a handler and the
 * bar stays shown there.
 */
import { createContext, useCallback, useContext, useMemo, type PropsWithChildren } from 'react';
import {
  useAnimatedScrollHandler,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';

// Sustained drag (px) in one direction before the bar flips — swallows scroll
// jitter and the tiny reversals of a finger settling.
const DIRECTION_THRESHOLD_PX = 12;
// Within this many px of the top the bar is always shown — the header region
// shouldn't ever hide navigation, and it absorbs iOS rubber-band at the top.
const NEAR_TOP_PX = 64;

type ScrollHandler = ReturnType<typeof useAnimatedScrollHandler>;

interface TabBarVisibilityValue {
  /** 1 = fully shown, 0 = fully hidden. The TabBar animates its translateY off this. */
  readonly visible: SharedValue<number>;
  /** A ready-made `onScroll` handler for a screen's Animated scroll component. */
  readonly scrollHandler: ScrollHandler;
  /** Force the bar shown (called on tab change so a hidden bar re-reveals). */
  readonly show: () => void;
}

const TabBarVisibilityContext = createContext<TabBarVisibilityValue | null>(null);

export function TabBarVisibilityProvider({ children }: PropsWithChildren) {
  const visible = useSharedValue(1);
  // Accumulated one-direction travel and the last seen offset — worklet-owned so
  // the whole direction calculation runs on the UI thread without JS round-trips.
  const accum = useSharedValue(0);
  const lastY = useSharedValue(0);

  const scrollHandler = useAnimatedScrollHandler(
    {
      onScroll: (event) => {
        'worklet';
        const y = event.contentOffset.y;
        // Clamp rubber-band: a negative offset (top bounce) reads as "at top".
        const clampedY = y < 0 ? 0 : y;

        if (clampedY <= NEAR_TOP_PX) {
          // Near the top the bar is always shown; reset the accumulator so the
          // first drag away from the top starts clean.
          accum.value = 0;
          lastY.value = clampedY;
          visible.value = 1;
          return;
        }

        const delta = clampedY - lastY.value;
        lastY.value = clampedY;

        // Reset the accumulator whenever direction reverses, then build travel in
        // the current direction until it crosses the threshold.
        if ((delta > 0 && accum.value < 0) || (delta < 0 && accum.value > 0)) {
          accum.value = 0;
        }
        accum.value += delta;

        if (accum.value > DIRECTION_THRESHOLD_PX) {
          visible.value = 0; // scrolling down → hide
        } else if (accum.value < -DIRECTION_THRESHOLD_PX) {
          visible.value = 1; // scrolling up → show
        }
      },
    },
    [],
  );

  const show = useCallback(() => {
    visible.value = 1;
    accum.value = 0;
    lastY.value = 0;
  }, [visible, accum, lastY]);

  const value = useMemo<TabBarVisibilityValue>(
    () => ({ visible, scrollHandler, show }),
    [visible, scrollHandler, show],
  );

  return (
    <TabBarVisibilityContext.Provider value={value}>{children}</TabBarVisibilityContext.Provider>
  );
}

/**
 * Read the tab-bar visibility handle. Returns null outside the provider (e.g. the
 * design lab), so callers optional-chain `scrollHandler` — a screen rendered
 * outside the tab shell just doesn't drive the bar.
 */
export function useTabBarVisibility(): TabBarVisibilityValue | null {
  return useContext(TabBarVisibilityContext);
}
