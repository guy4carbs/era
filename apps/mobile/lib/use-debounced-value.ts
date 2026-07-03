/**
 * useDebouncedValue — trails a fast-changing value by a fixed delay.
 *
 * Returns the input value only after it has held steady for `delayMs`. Used to
 * keep the closet's client-side search filter off the keystroke path.
 */
import { useEffect, useState } from 'react';

export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
