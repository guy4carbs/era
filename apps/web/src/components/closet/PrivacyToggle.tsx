'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { motion as motionToken, spacing } from '@era/tokens';
import { Text } from '../Text';
import { strings } from '@era/core/strings';
import { transitionFor } from '../../lib/motion';

/**
 * Closet privacy switch. Reads the owner's `isPrivate` on mount and PATCHes it
 * on toggle, optimistically: the thumb moves immediately and reverts if the
 * write fails. Public reads as accent (this can appear publicly); private reads
 * muted (only you). `is_private` is a real visibility control — the same flag
 * that governs whether cutouts resolve to public URLs — not a cosmetic label.
 */
export function PrivacyToggle() {
  const reduced = useReducedMotion();
  const [isPrivate, setIsPrivate] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const res = await fetch('/api/profile/privacy');
        if (!res.ok) throw new Error('privacy fetch failed');
        const body = (await res.json()) as { isPrivate: boolean };
        if (active) setIsPrivate(body.isPrivate);
      } catch {
        // Fail closed — assume private until we can read the real value.
        if (active) setIsPrivate(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function toggle() {
    if (isPrivate === null || busy) return;
    const next = !isPrivate;
    setIsPrivate(next); // optimistic
    setBusy(true);
    try {
      const res = await fetch('/api/profile/privacy', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ isPrivate: next }),
      });
      if (!res.ok) throw new Error('privacy patch failed');
    } catch {
      setIsPrivate(!next); // revert
    } finally {
      setBusy(false);
    }
  }

  // Hold the row's footprint until the real value lands (no layout jump).
  if (isPrivate === null) {
    return <div style={{ ...rowStyle, minHeight: 'var(--touch-target-min)' }} aria-hidden="true" />;
  }

  const isPublic = !isPrivate;
  const label = isPublic ? strings.closet.privacyPublic : strings.closet.privacyPrivate;
  const hint = isPublic ? strings.closet.privacyHintPublic : strings.closet.privacyHintPrivate;

  return (
    <div style={columnStyle}>
      <div style={rowStyle}>
        <Text
          variant="ui"
          size="subhead"
          weight={700}
          as="span"
          id="privacy-label"
          style={{ color: isPublic ? 'var(--color-accent)' : 'var(--color-secondary-strong)' }}
        >
          {label}
        </Text>
        <button
          type="button"
          role="switch"
          aria-checked={isPublic}
          aria-labelledby="privacy-label"
          disabled={busy}
          onClick={toggle}
          style={{
            ...trackStyle,
            background: isPublic ? 'var(--color-accent)' : 'var(--color-hairline)',
          }}
        >
          <motion.span
            aria-hidden="true"
            style={thumbStyle}
            animate={{ x: isPublic ? spacing.s6 : 0 }}
            transition={transitionFor(motionToken.springs.snappy, reduced)}
          />
        </button>
      </div>
      <Text
        variant="caption"
        size="footnote"
        as="span"
        style={{ margin: 0, color: 'var(--color-secondary-strong)', textAlign: 'right' }}
      >
        {hint}
      </Text>
    </div>
  );
}

const columnStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-end',
  gap: 'var(--space-1)',
};

const rowStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'var(--space-2)',
};

// Track: 48×24 pill (space-12 × space-6), 4px inset (space-1); thumb travels
// space-6 (48 − 2·4 − 16). All dimensions are spacing tokens.
const trackStyle: CSSProperties = {
  position: 'relative',
  display: 'inline-flex',
  alignItems: 'center',
  width: 'var(--space-12)',
  height: 'var(--space-6)',
  padding: 'var(--space-1)',
  borderRadius: 'var(--radius-hero)',
  border: 'none',
  cursor: 'pointer',
};

const thumbStyle: CSSProperties = {
  width: 'var(--space-4)',
  height: 'var(--space-4)',
  borderRadius: 'var(--radius-full)',
  background: 'var(--color-bg)',
};

