/**
 * OviState — the shared living-state + open channel between Ovi's surfaces.
 *
 * The FAB and the chat panel mount in different subtrees of the tab shell, yet
 * both render the same living orb and must breathe as one character. This
 * lightweight context lifts Ovi's 'idle' | 'thinking' | 'speaking' state so the
 * corner FAB shimmers while the panel is thinking and pulses while a reply
 * lands. THINKING is bound to the in-flight request; SPEAKING is bound to the
 * client-side word stream — `startSpeaking()` opens it when the first word lands
 * and `stopSpeaking()` closes it when the last word lands (or the user taps to
 * skip), so the orb pulses for exactly as long as Ovi is actually "talking".
 *
 * The same context also owns the OPEN channel. The chat sheet lives in the tab
 * shell, but the surfaces that want to open it (the closet, a piece's detail
 * sheet, the design canvas — via their {@link OviSuggestion} strips) are deep in
 * the navigator tree with no prop path back to the shell. `openOvi(request)`
 * bridges that gap: a surface asks Ovi to open PRE-SEEDED with an intent (and an
 * optional focal piece), the shell reads the request and raises the sheet, and
 * the sheet auto-sends the seed as the user's first turn — so tapping "Show me"
 * lands the user straight in Ovi's answer, not an empty box (mirrors the web
 * OviChatProvider seed contract).
 */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';

import type { OviIntent } from '@era/core/ovi';

import type { OviOrbState } from './OviOrb';

/**
 * A request to open Ovi pre-seeded. `intent` is the ask auto-sent on open;
 * `itemId` is the focal piece for a `style_item` seed (null otherwise). A `null`
 * open request means Ovi was opened plainly (the FAB) — no seed to auto-send.
 */
export interface OviOpenRequest {
  readonly intent: OviIntent;
  readonly itemId: string | null;
}

interface OviStateValue {
  readonly state: OviOrbState;
  /** THINKING while a request is in flight; false returns to idle. */
  readonly setThinking: (thinking: boolean) => void;
  /** Enter SPEAKING — held for the whole word-stream reveal. */
  readonly startSpeaking: () => void;
  /** Leave SPEAKING back to idle — the stream finished or was skipped. */
  readonly stopSpeaking: () => void;
  /**
   * The pending open request the shell should honour, or null when Ovi is open
   * plainly / closed. The shell consumes it (raises the sheet + hands the seed
   * to the panel) and clears it on close.
   */
  readonly openRequest: OviOpenRequest | null;
  /** Open Ovi. Pass a request to pre-seed the first turn; omit for a plain open. */
  readonly openOvi: (request?: OviOpenRequest) => void;
  /** Clear the pending open request (the shell calls this as the sheet closes). */
  readonly clearOpen: () => void;
}

const OviStateContext = createContext<OviStateValue | null>(null);

export function OviStateProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<OviOrbState>('idle');
  const [openRequest, setOpenRequest] = useState<OviOpenRequest | null>(null);

  const setThinking = useCallback((thinking: boolean) => {
    setState(thinking ? 'thinking' : 'idle');
  }, []);

  const startSpeaking = useCallback(() => setState('speaking'), []);
  const stopSpeaking = useCallback(() => setState('idle'), []);

  const openOvi = useCallback((request?: OviOpenRequest) => {
    setOpenRequest(request ?? null);
  }, []);
  const clearOpen = useCallback(() => setOpenRequest(null), []);

  const value = useMemo<OviStateValue>(
    () => ({
      state,
      setThinking,
      startSpeaking,
      stopSpeaking,
      openRequest,
      openOvi,
      clearOpen,
    }),
    [state, setThinking, startSpeaking, stopSpeaking, openRequest, openOvi, clearOpen],
  );

  return <OviStateContext.Provider value={value}>{children}</OviStateContext.Provider>;
}

/**
 * Read Ovi's living state + open channel. Returns a stable idle/no-op fallback
 * when no provider is mounted, so a surface can render the orb (or a strip that
 * never opens anything) without caring whether the shared channel exists (the
 * closet greeting, the design lab).
 */
export function useOviState(): OviStateValue {
  return (
    useContext(OviStateContext) ?? {
      state: 'idle',
      setThinking: () => undefined,
      startSpeaking: () => undefined,
      stopSpeaking: () => undefined,
      openRequest: null,
      openOvi: () => undefined,
      clearOpen: () => undefined,
    }
  );
}
