/**
 * OviState — the shared living-state channel between Ovi's surfaces.
 *
 * The FAB and the chat panel mount in different subtrees of the tab shell, yet
 * both render the same living orb and must breathe as one character. This
 * lightweight context lifts Ovi's 'idle' | 'thinking' | 'speaking' state so the
 * corner FAB shimmers while the panel is thinking and pulses while a reply
 * lands. THINKING is bound to the in-flight request; SPEAKING is a bounded
 * window opened when a reply arrives (`speak()` self-settles back to idle).
 */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';

import type { OviOrbState } from './OviOrb';

/** How long the SPEAKING pulse holds after a reply lands before settling. */
const SPEAKING_WINDOW_MS = 2400;

interface OviStateValue {
  readonly state: OviOrbState;
  /** THINKING while a request is in flight; false returns to idle. */
  readonly setThinking: (thinking: boolean) => void;
  /** Open a bounded SPEAKING window, then settle to idle. */
  readonly speak: () => void;
}

const OviStateContext = createContext<OviStateValue | null>(null);

export function OviStateProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<OviOrbState>('idle');
  const speakTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearSpeak = useCallback(() => {
    if (speakTimer.current) {
      clearTimeout(speakTimer.current);
      speakTimer.current = null;
    }
  }, []);

  const setThinking = useCallback(
    (thinking: boolean) => {
      clearSpeak();
      setState(thinking ? 'thinking' : 'idle');
    },
    [clearSpeak],
  );

  const speak = useCallback(() => {
    clearSpeak();
    setState('speaking');
    speakTimer.current = setTimeout(() => {
      speakTimer.current = null;
      setState('idle');
    }, SPEAKING_WINDOW_MS);
  }, [clearSpeak]);

  const value = useMemo<OviStateValue>(
    () => ({ state, setThinking, speak }),
    [state, setThinking, speak],
  );

  return <OviStateContext.Provider value={value}>{children}</OviStateContext.Provider>;
}

/**
 * Read Ovi's living state. Returns a stable idle fallback when no provider is
 * mounted, so a surface can render the orb without caring whether the shared
 * channel exists (the closet greeting, the design lab).
 */
export function useOviState(): OviStateValue {
  return (
    useContext(OviStateContext) ?? {
      state: 'idle',
      setThinking: () => undefined,
      speak: () => undefined,
    }
  );
}
