'use client';

import { type CSSProperties, type ReactNode } from 'react';
import { OviOrb } from './OviOrb';
import { Text } from '../Text';

/**
 * OviLoader — every waiting beat is Ovi's orb breathing, not a spinner (D-WAIT).
 *
 * Two variants over the existing {@link OviOrb} idle state (which already handles
 * reduced motion — a static orb, no breath). This replaces every spinner and
 * plain-text "Loading…" across the web app:
 *
 *   inline — the orb at its whisper size (orb.size.whisperPx → --orb-whisper),
 *            sitting in a row with an OPTIONAL quiet caption. For load-more,
 *            in-drawer waits, sign-in pending — anywhere a small busy state shows.
 *   page   — the orb at its corner size (orb.size.cornerPx → --orb-corner),
 *            centred in the surface with generous vertical rhythm. The full-screen
 *            "the surface is loading" beat.
 *
 * The orb is decorative here (aria-hidden inside OviOrb); this wrapper carries the
 * live-region semantics so assistive tech announces the wait: role="status" +
 * aria-busy, and the caption (if any) is the announced text. When no caption is
 * passed, an aria-label names the wait so the status node is never silent.
 */
export interface OviLoaderProps {
  /** `inline` (whisper orb + optional caption row) or `page` (centred corner orb). */
  variant?: 'inline' | 'page';
  /** A quiet line beside/under the orb. Doubles as the announced status text. */
  caption?: ReactNode;
  /** aria-label when there is no visible caption, so the status node still speaks. */
  label?: string;
  style?: CSSProperties;
}

const inlineRowStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'var(--space-2)',
};

const pageColumnStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 'var(--space-4)',
  paddingBlock: 'var(--space-16)',
  textAlign: 'center',
};

export function OviLoader({ variant = 'inline', caption, label, style }: OviLoaderProps) {
  const isPage = variant === 'page';

  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={caption ? undefined : label}
      style={{ ...(isPage ? pageColumnStyle : inlineRowStyle), ...style }}
    >
      {/* The orb rides its own IDLE breath (or holds static under reduced motion);
          it is aria-hidden inside OviOrb, so the wrapper owns the announcement. */}
      <OviOrb size={isPage ? 'corner' : { cssVar: 'var(--orb-whisper)' }} state="idle" />
      {caption ? (
        <Text
          variant="caption"
          size="footnote"
          as="span"
          style={{ color: 'var(--color-secondary-strong)' }}
        >
          {caption}
        </Text>
      ) : null}
    </div>
  );
}
