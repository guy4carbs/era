'use client';

import { type CSSProperties } from 'react';
import { strings } from '@era/core/strings';
import { Text } from './Text';
import { Button } from './Button';

/**
 * FailedLoad — the page-level "this couldn't load" editorial state (D-WAIT).
 *
 * A single calm Fraunces line (strings.errors.failedLoad, in the oviAccent
 * editorial register) with ONE action — the retry Button (strings.errors.retry).
 * No red banner, no alarm, no exclamation: the brand keeps its voice when a
 * surface can't load. Use this ONLY when a whole surface errors at the page level
 * (closet/shop/feed/worn/design fetch failure) — inline field errors and quiet
 * transient toasts have their own grammar.
 *
 * Separate from the empty state on purpose: empty is an invitation
 * (surface-specific voice), error is a failure with a retry. Never conflate them.
 */
export interface FailedLoadProps {
  /** The retry handler — refetches the surface. */
  onRetry: () => void;
  /** Editorial line override (defaults to the canonical failedLoad copy). */
  line?: string;
  style?: CSSProperties;
}

const columnStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 'var(--space-4)',
  paddingBlock: 'var(--space-16)',
  textAlign: 'center',
};

export function FailedLoad({ onRetry, line, style }: FailedLoadProps) {
  return (
    <div role="alert" style={{ ...columnStyle, ...style }}>
      {/* oviAccent — Fraunces Italic, the editorial register. The failure reads as
          a quiet aside, not a system error. */}
      <Text variant="oviAccent" as="p" style={{ margin: 0, color: 'var(--color-text)' }}>
        {line ?? strings.errors.failedLoad}
      </Text>
      <Button variant="secondary" onClick={onRetry}>
        {strings.errors.retry}
      </Button>
    </div>
  );
}
