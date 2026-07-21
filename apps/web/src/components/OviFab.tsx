'use client';

import { type CSSProperties, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { motion as motionToken } from '@era/tokens';
import { strings } from '@era/core/strings';
import { transitionFor } from '../lib/motion';
import { OviOrb, type OviOrbState } from './ovi/OviOrb';
import { Text } from './Text';

export interface OviFabProps {
  onClick?: () => void;
  /** Ovi's living state, threaded from the chat provider so the orb reacts. */
  state?: OviOrbState;
  style?: CSSProperties;
}

/** localStorage key: the first-session whisper tooltip has been seen. */
const TIP_SEEN_KEY = 'era-ovi-orb-tip-seen';

/** SSR-safe read of the tip-seen flag; treats any failure as "already seen". */
function readTipSeen(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(TIP_SEEN_KEY) === '1';
  } catch {
    return true;
  }
}

/** SSR-safe write marking the whisper tooltip seen. Best-effort. */
function markTipSeen(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(TIP_SEEN_KEY, '1');
  } catch {
    // Private mode / disabled storage: the tip simply re-shows next session.
  }
}

const wrapStyle: CSSProperties = {
  position: 'fixed',
  right: 'var(--space-4)',
  // No tab bar on web (the rail is the nav) — the orb hugs the corner.
  bottom: 'calc(var(--space-4) + env(safe-area-inset-bottom))',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'var(--space-3)',
  zIndex: 60,
};

const tipStyle: CSSProperties = {
  paddingInline: 'var(--space-3)',
  paddingBlock: 'var(--space-2)',
  borderRadius: 'var(--radius-card)',
  background: 'var(--color-surface)',
  border: '1px solid var(--color-hairline)',
  boxShadow: 'var(--shadow-e2)',
  color: 'var(--color-text)',
  whiteSpace: 'nowrap',
};

/** How long the first-session whisper lingers before it fades and marks seen. */
const TIP_LINGER_MS = 4200;

/**
 * Ovi's corner summon — the living orb (44px), replacing the old accent text
 * button. It breathes/shimmers/pulses per Ovi's {@link OviOrbState}, leans toward
 * the pointer, and opens the chat on tap. On the FIRST session only, a whisper
 * tooltip ("Ovi, your stylist", Fraunces Italic) surfaces beside it and dismisses
 * on the first open or after a short linger; under reduced motion it appears
 * statically and holds until dismissed.
 */
export function OviFab({ onClick, state = 'idle', style }: OviFabProps) {
  const reduced = useReducedMotion();
  const [showTip, setShowTip] = useState(false);
  const dismissedRef = useRef(false);

  // First-session whisper: read the seen-flag once on mount (SSR-safe). If unseen
  // and motion is allowed, linger then fade + mark seen; under reduced motion it
  // stays until the first open dismisses it.
  useEffect(() => {
    if (readTipSeen()) return;
    setShowTip(true);
    if (reduced) return;
    const handle = setTimeout(() => dismissTip(), TIP_LINGER_MS);
    return () => clearTimeout(handle);
    // Runs once on mount: the first-session whisper decision is a mount-time read.
  }, []);

  function dismissTip() {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    setShowTip(false);
    markTipSeen();
  }

  function handleClick() {
    dismissTip();
    onClick?.();
  }

  return (
    <div style={{ ...wrapStyle, ...style }}>
      <AnimatePresence>
        {showTip ? (
          <motion.span
            style={tipStyle}
            initial={reduced ? { opacity: 0 } : { opacity: 0, x: motionToken.stagger.riseYPx }}
            animate={reduced ? { opacity: 1 } : { opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            transition={transitionFor(motionToken.springs.gentle, reduced)}
          >
            <Text variant="oviAccent" as="span" size="subhead">
              {strings.ovi.fabLabel}
            </Text>
          </motion.span>
        ) : null}
      </AnimatePresence>
      <OviOrb
        size="corner"
        state={state}
        interactive
        label={strings.ovi.fabLabel}
        onClick={handleClick}
      />
    </div>
  );
}
