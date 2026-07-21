/**
 * OviState — the shared living-state channel between Ovi's surfaces.
 *
 * The FAB and the chat panel mount in different subtrees of the tab shell, yet
 * both render the same living orb and must breathe as one character. This
 * lightweight context lifts Ovi's 'idle' | 'thinking' | 'speaking' state so the
 * corner FAB shimmers while the panel is thinking and pulses while a reply
 * lands. THINKING is bound to the in-flight request; SPEAKING is bound to the
 * client-side word stream — `startSpeaking()` opens it when the first word lands
 * and `stopSpeaking()` closes it when the last word lands (or the user taps to
 * skip), so the orb pulses for exactly as long as Ovi is actually "talking".
 */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';

import type { OviOrbState } from './OviOrb';

interface OviStateValue {
  readonly state: OviOrbState;
  /** THINKING while a request is in flight; false returns to idle. */
  readonly setThinking: (thinking: boolean) => void;
  /** Enter SPEAKING — held for the whole word-stream reveal. */
  readonly startSpeaking: () => void;
  /** Leave SPEAKING back to idle — the stream finished or was skipped. */
  readonly stopSpeaking: () => void;
}

const OviStateContext = createContext<OviStateValue | null>(null);

export function OviStateProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<OviOrbState>('idle');

  const setThinking = useCallback((thinking: boolean) => {
    setState(thinking ? 'thinking' : 'idle');
  }, []);

  const startSpeaking = useCallback(() => setState('speaking'), []);
  const stopSpeaking = useCallback(() => setState('idle'), []);

  const value = useMemo<OviStateValue>(
    () => ({ state, setThinking, startSpeaking, stopSpeaking }),
    [state, setThinking, startSpeaking, stopSpeaking],
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
      startSpeaking: () => undefined,
      stopSpeaking: () => undefined,
    }
  );
}
