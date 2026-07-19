/**
 * Closet density persistence — the read-on-mount / write-on-change pair for the
 * gallery's comfortable | compact toggle, mirroring lib/theme.tsx's AsyncStorage
 * idiom (a plain module helper, no context — the closet owns the single piece of
 * state). `comfortable` (2 columns, editorial gutter) is the default when nothing
 * is stored or the stored value is unrecognised.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { ClosetDensity } from '@/components/closet';

const STORAGE_KEY = 'era-closet-density';

/** The persisted density, or `comfortable` when unset / unrecognised. */
export async function readClosetDensity(): Promise<ClosetDensity> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    return stored === 'compact' ? 'compact' : 'comfortable';
  } catch {
    return 'comfortable';
  }
}

/** Persist the chosen density (fire-and-forget; a write failure is non-fatal). */
export function writeClosetDensity(density: ClosetDensity): void {
  void AsyncStorage.setItem(STORAGE_KEY, density);
}
