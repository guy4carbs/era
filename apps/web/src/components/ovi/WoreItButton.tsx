'use client';

import { useState, type CSSProperties } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { motion as motionToken, typeRamp } from '@era/tokens';
import { strings } from '@era/core/strings';
import { transitionFor } from '../../lib/motion';
import { Button } from '../Button';
import { analytics } from '../../lib/analytics';
import { logWear } from './ovi-actions';

export interface WoreItButtonProps {
  /** Item ids of the piece(s) being logged — used when there is no saved outfit id. */
  itemIds?: readonly string[];
  /** A saved outfit's id, when logging a persisted look rather than loose items. */
  outfitId?: string;
  /**
   * Coarse coordinates the surface already holds, forwarded so the server can
   * snapshot the weather. Never prompted for here — omit on surfaces without them.
   */
  lat?: number | null;
  lon?: number | null;
  /** The surface firing the event, recorded as `wear_logged { via }`. */
  via: string;
  /** Confirmed-state line; defaults to the outfit-level "Logged — nice pick." */
  confirmedLabel?: string;
  /** Fired on a real 201 so the parent can bump its own count / cost-per-wear. */
  onLogged?: () => void;
  /** Fired on a failed write so the parent can surface a retry toast. */
  onError?: () => void;
}

type WearStatus = 'idle' | 'logging' | 'confirmed';

const confirmedStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: 'var(--touch-target-web)',
  fontSize: typeRamp.footnote.rem,
  lineHeight: `${typeRamp.footnote.lineHeight}px`,
  fontWeight: 600,
  color: 'var(--color-secondary-strong)',
};

/**
 * The daily-loop affordance that logs a look as worn today — the web counterpart
 * to the mobile `WoreItButton`. One press posts to `/api/wear-logs`; the button
 * flips to a confirmed line as soon as the write lands and, on a real 201, fires
 * `wear_logged` and calls {@link WoreItButtonProps.onLogged}. A failed write
 * reverts to the CTA and calls {@link WoreItButtonProps.onError} so the parent
 * can toast a retry. Once confirmed it stays confirmed for the session — the
 * button owns the guard against double-logging the same card. The confirmed line
 * eases in gently and pins static under reduced motion.
 */
export function WoreItButton({
  itemIds,
  outfitId,
  lat,
  lon,
  via,
  confirmedLabel,
  onLogged,
  onError,
}: WoreItButtonProps) {
  const reduced = useReducedMotion();
  const [status, setStatus] = useState<WearStatus>('idle');

  async function handleWore() {
    // Session guard: only the first real press logs; a confirmed card is done.
    if (status !== 'idle') return;
    setStatus('logging');
    const logged = await logWear({ outfitId, itemIds, lat, lon });
    if (logged) {
      setStatus('confirmed');
      // Only a real 201 counts toward the funnel.
      analytics.track('wear_logged', { via });
      onLogged?.();
    } else {
      // Graceful failure: revert so the user can try again, honestly toasted.
      setStatus('idle');
      onError?.();
    }
  }

  if (status === 'confirmed') {
    return (
      <motion.span
        role="status"
        style={confirmedStyle}
        initial={reduced ? { opacity: 0 } : { opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={transitionFor(motionToken.springs.gentle, reduced)}
      >
        {confirmedLabel ?? strings.ovi.woreItConfirmed}
      </motion.span>
    );
  }

  return (
    <Button variant="secondary" disabled={status === 'logging'} onClick={() => void handleWore()}>
      {strings.ovi.woreItCta}
    </Button>
  );
}
