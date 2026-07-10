'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { strings } from '@era/core/strings';
import { typeRamp } from '@era/tokens';

export interface CopyLinkButtonProps {
  /** The absolute, canonical profile URL to place on the clipboard. */
  url: string;
  /** Show the "this is how your profile looks to others" hint above the button. */
  withHint?: boolean;
}

/**
 * The owner's share affordance, shown where a visitor would see the Follow
 * button. Optionally leads with `ownProfileHint`, then a Copy-link button that
 * writes the canonical profile URL to the clipboard and confirms with a transient
 * `linkCopied` line (a polite live region that clears itself). Distinct from the
 * OS share sheet — this is the "grab my link" path. A blocked clipboard fails
 * quietly (no error surfaced): the worst case is simply no confirmation.
 */
export function CopyLinkButton({ url, withHint = true }: CopyLinkButtonProps) {
  const [copied, setCopied] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => {
      if (mounted.current) setCopied(false);
    }, 2500);
    return () => clearTimeout(timer);
  }, [copied]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      if (mounted.current) setCopied(true);
    } catch {
      // Clipboard blocked — stay quiet; nothing here is destructive.
    }
  }

  return (
    <div style={wrapStyle}>
      {withHint ? <p style={hintStyle}>{strings.profile.ownProfileHint}</p> : null}
      <button type="button" style={buttonStyle} onClick={() => void handleCopy()}>
        {strings.profile.copyLinkCta}
      </button>
      <p aria-live="polite" style={confirmStyle}>
        {copied ? strings.profile.linkCopied : ''}
      </p>
    </div>
  );
}

const wrapStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
  alignItems: 'flex-start',
};

const hintStyle: CSSProperties = {
  margin: 0,
  fontSize: typeRamp.footnote.rem,
  lineHeight: `${typeRamp.footnote.lineHeight}px`,
  color: 'var(--color-secondary-strong)',
};

// Mirrors the settings secondary-action frame (sign-out / copy) for consistency.
const buttonStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: 'var(--touch-target-web)',
  paddingInline: 'var(--space-4)',
  borderRadius: 'var(--radius-input)',
  border: '1px solid var(--color-hairline)',
  background: 'var(--color-surface)',
  color: 'var(--color-text)',
  fontSize: typeRamp.subhead.rem,
  lineHeight: `${typeRamp.subhead.lineHeight}px`,
  fontWeight: 600,
  cursor: 'pointer',
};

const confirmStyle: CSSProperties = {
  margin: 0,
  minHeight: `${typeRamp.footnote.lineHeight}px`,
  fontSize: typeRamp.footnote.rem,
  lineHeight: `${typeRamp.footnote.lineHeight}px`,
  color: 'var(--color-secondary-strong)',
};
