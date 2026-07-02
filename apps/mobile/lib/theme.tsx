/**
 * Era mobile — theme system.
 *
 * Resolves the active colour scheme from the OS default (`useColorScheme`),
 * overridable by a persisted user preference ('light' | 'dark' | 'system')
 * stored under `era-theme` in AsyncStorage. `useTheme()` exposes the resolved
 * palette so every screen and component reads colour from tokens only — no
 * hardcoded design values live in the UI layer.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { palette, type ThemeMode } from '@era/tokens';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import { useColorScheme } from 'react-native';

type ResolvedMode = 'light' | 'dark';

/** User-selectable preference: a concrete palette mode, or follow the OS. */
export type ThemePreference = ThemeMode | 'system';

/**
 * The resolved palette a screen reads: the mode's colour roles plus the
 * mode-independent tokens the UI needs as flat colours — `ink` (scrim/shadow)
 * and the semantic status hues surfaced as `danger` (rust) / `success` (sage).
 */
function resolveColors(mode: ResolvedMode) {
  return {
    ...palette[mode],
    ink: palette.ink,
    danger: palette.semantic.rust,
    success: palette.semantic.sage,
  } as const;
}

type ThemeColors = ReturnType<typeof resolveColors>;

const STORAGE_KEY = 'era-theme';

interface ThemeContextValue {
  /** User preference: 'light' | 'dark' | 'system'. */
  readonly mode: ThemePreference;
  /** The scheme actually applied ('light' | 'dark'). */
  readonly resolved: ResolvedMode;
  /** Palette for the resolved scheme. */
  readonly colors: ThemeColors;
  readonly setMode: (mode: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: PropsWithChildren) {
  const system = useColorScheme();
  const [mode, setModeState] = useState<ThemePreference>('system');

  // Hydrate the persisted preference once on mount.
  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (active && isThemePreference(stored)) {
        setModeState(stored);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const setMode = useMemo(
    () => (next: ThemePreference) => {
      setModeState(next);
      void AsyncStorage.setItem(STORAGE_KEY, next);
    },
    [],
  );

  const resolved: ResolvedMode =
    mode === 'system' ? (system === 'dark' ? 'dark' : 'light') : mode;

  const value = useMemo<ThemeContextValue>(
    () => ({ mode, resolved, colors: resolveColors(resolved), setMode }),
    [mode, resolved, setMode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return ctx;
}

function isThemePreference(value: string | null): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}
