'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { strings } from '@era/core/strings';
import { typeRamp } from '@era/tokens';
import { pressProps } from '../../lib/motion';
import { Text, TextControlBoundary } from '../Text';

export interface CopyLinkButtonProps {
  /** The absolute, canonical profile URL to place on the clipboard. */
  url: string;
  /** Show the "this is how your profile looks to others" hint above the button. */
  withHint?: boolean;
  /** Cross-axis alignment — `start` in the left-aligned header, `center` on the private card. */
  align?: 'start' | 'center';
}

/**
 * The owner's share affordance, shown where a visitor would see the Follow
 * button. Optionally leads with `ownProfileHint`, then a Copy-link button that
 * writes the canonical profile URL to the clipboard and confirms with a transient
 * `linkCopied` line (a polite live region that clears itself). Distinct from the
 * OS share sheet — this is the "grab my link" path. A blocked clipboard fails
 * quietly (no error surfaced): the worst case is simply no confirmation.
 */
export function CopyLinkButton({ url, withHint = true, align = 'start' }: CopyLinkButtonProps) {
  const reduced = useReducedMotion();
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

  const crossAxis = align === 'center' ? 'center' : 'flex-start';
  return (
    <div style={{ ...wrapStyle, alignItems: crossAxis, textAlign: align === 'center' ? 'center' : 'start' }}>
      {withHint ? (
        <Text variant="caption" size="footnote" as="p" style={hintStyle}>
          {strings.profile.ownProfileHint}
        </Text>
      ) : null}
      <TextControlBoundary>
        <motion.button type="button" style={buttonStyle} onClick={() => void handleCopy()} {...pressProps(reduced)}>
          <Text variant="ui" size="subhead" weight={600} as="span">
            {strings.profile.copyLinkCta}
          </Text>
        </motion.button>
      </TextControlBoundary>
      <Text variant="caption" size="footnote" as="p" aria-live="polite" style={confirmStyle}>
        {copied ? strings.profile.linkCopied : ''}
      </Text>
    </div>
  );
}

const wrapStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
};

const hintStyle: CSSProperties = {
  margin: 0,
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
  cursor: 'pointer',
};

const confirmStyle: CSSProperties = {
  margin: 0,
  minHeight: `${typeRamp.footnote.lineHeight}px`,
  color: 'var(--color-secondary-strong)',
};
