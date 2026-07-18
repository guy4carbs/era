/**
 * StaggerItem — a drop-in entrance wrapper for a list/grid/chat child.
 *
 * Wraps its children in the {@link useStaggerEntrance} rise+fade so mapped lists
 * and `FlatList` rows cascade in on mount (§3, minus blur). The entrance fires
 * once per mounted instance — for a `FlatList` that means the first time a row
 * scrolls into range — so re-renders never replay it.
 *
 * `index` drives the cascade delay; it is clamped to `maxCascade` (default 8) so
 * a long list's later rows appear promptly instead of waiting `index × 45ms`.
 * Pass a small window index (e.g. the position within the first screenful) for
 * the tightest feel; the clamp keeps even the raw list index sane.
 */
import { type PropsWithChildren } from 'react';
import Animated from 'react-native-reanimated';

import { useReducedMotionSafe, useStaggerEntrance } from '@/lib/motion';

interface StaggerItemProps {
  readonly index: number;
  /** Upper bound on the cascade index so late rows don't wait a long delay. */
  readonly maxCascade?: number;
}

export function StaggerItem({
  index,
  maxCascade = 8,
  children,
}: PropsWithChildren<StaggerItemProps>) {
  const reduced = useReducedMotionSafe();
  const style = useStaggerEntrance(Math.min(index, maxCascade), reduced);
  return <Animated.View style={style}>{children}</Animated.View>;
}
