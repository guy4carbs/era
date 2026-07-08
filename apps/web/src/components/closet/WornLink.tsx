'use client';

import Link from 'next/link';
import { type CSSProperties } from 'react';

/**
 * The closet header's route into the wear calendar (`/worn`). A calendar
 * affordance sized to the min touch target and labelled for screen readers (the
 * glyph is decorative), mirroring {@link SettingsLink} so the two sit as a quiet
 * icon cluster in the header. All dimensions/colours are tokens.
 */
export function WornLink() {
  return (
    <Link href="/worn" aria-label="Wear calendar" style={linkStyle}>
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <rect x="3" y="4" width="18" height="17" rx="2" />
        <path d="M3 9h18M8 2v4M16 2v4" />
        <path d="M8 14h.01M12 14h.01M16 14h.01" />
      </svg>
    </Link>
  );
}

const linkStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 'var(--touch-target-min)',
  height: 'var(--touch-target-min)',
  flexShrink: 0,
  borderRadius: 'var(--radius-chip)',
  color: 'var(--color-secondary-strong)',
};
