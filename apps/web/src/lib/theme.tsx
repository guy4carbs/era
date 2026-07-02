'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

/** User-selectable theme preference. `system` follows the OS. */
export type ThemeMode = 'light' | 'dark' | 'system';

/** The concrete theme actually applied to the document. */
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'era-theme';

interface ThemeContextValue {
  mode: ThemeMode;
  resolved: ResolvedTheme;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function systemPreference(): ResolvedTheme {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function resolve(mode: ThemeMode): ResolvedTheme {
  return mode === 'system' ? systemPreference() : mode;
}

/**
 * Owns the theme preference and keeps `data-theme` on <html> in sync. The
 * no-flash script in the document head has already set the correct attribute
 * for first paint; this provider takes over on hydration and reacts to both
 * manual toggles and live OS changes while in `system` mode.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('system');
  const [resolved, setResolved] = useState<ResolvedTheme>('light');

  // Hydrate the stored preference after mount to stay SSR-safe.
  useEffect(() => {
    let stored: ThemeMode = 'system';
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === 'light' || raw === 'dark' || raw === 'system') stored = raw;
    } catch {
      // Storage unavailable (private mode / SSR mismatch) — keep the default.
    }
    setModeState(stored);
  }, []);

  // Apply the resolved theme, and track OS changes while following the system.
  useEffect(() => {
    const apply = () => {
      const next = resolve(mode);
      setResolved(next);
      document.documentElement.dataset.theme = next;
    };
    apply();

    if (mode !== 'system') return;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, [mode]);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Non-fatal: the choice simply won't persist across reloads.
    }
  }, []);

  return (
    <ThemeContext.Provider value={{ mode, resolved, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
