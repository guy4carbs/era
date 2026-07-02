/**
 * Quiz image resolver.
 *
 * The bundled quiz photos live in `@/lib/quiz-images` (owned by the reel agent)
 * as `quizImages: Record<imageKey, require(...)>`. Options reference them by
 * key. A missing key resolves to `null` so callers can fall back to a token
 * gradient placeholder rather than crashing on an undefined `require`.
 */
import { quizImages } from '@/lib/quiz-images';
import type { ImageSourcePropType } from 'react-native';

// The reel-owned map is a concrete `as const` object; index it by arbitrary
// key through a widened view so a missing key resolves to `undefined`.
const imageMap = quizImages as Record<string, ImageSourcePropType>;

/** Resolve an option's `imageKey` to a bundled source, or `null` if absent. */
export function imageFor(imageKey: string | undefined): ImageSourcePropType | null {
  if (!imageKey) {
    return null;
  }
  return imageMap[imageKey] ?? null;
}
