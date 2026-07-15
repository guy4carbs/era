/**
 * useImageReadiness — fire once every image in a share template has settled.
 *
 * The share card is captured off-screen, so capture must wait until its imagery
 * has actually painted or the PNG bakes in half-loaded tiles. The template counts
 * how many images it expects and calls the returned `markLoaded` from each one's
 * `onLoad` AND `onError` (a broken URL must still count, or the gate hangs). When
 * the settled count reaches `expected` the `onReady` callback fires exactly once;
 * an `expected` of 0 (a cover-less, image-less card) fires immediately. Images
 * already in expo-image's cache fire `onLoad` synchronously, so a warm cache
 * settles the gate on the first paint — the fast path the host relies on.
 */
import { useCallback, useEffect, useRef } from 'react';

export function useImageReadiness(expected: number, onReady: () => void): () => void {
  const settled = useRef(0);
  const fired = useRef(false);
  const onReadyRef = useRef(onReady);

  // Keep the latest callback without re-identifying markLoaded on every render.
  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  const fireIfReady = useCallback(() => {
    if (fired.current || settled.current < expected) {
      return;
    }
    fired.current = true;
    onReadyRef.current();
  }, [expected]);

  const markLoaded = useCallback(() => {
    settled.current += 1;
    fireIfReady();
  }, [fireIfReady]);

  // Nothing to wait on — ready on mount.
  useEffect(() => {
    fireIfReady();
  }, [fireIfReady]);

  return markLoaded;
}
