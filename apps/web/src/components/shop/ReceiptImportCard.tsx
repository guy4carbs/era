'use client';

import { type CSSProperties } from 'react';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { motion as motionToken } from '@era/tokens';
import { Text } from '../Text';
import { markRead, type ReceiptImportPayload } from '../../lib/notifications-client';
import { transitionFor } from '../../lib/motion';

export interface ReceiptImportCardProps {
  /** The notification id — the key the read-mark and parent removal both use. */
  id: string;
  /** The receipt-import details: the draft count and the server-rendered line. */
  payload: ReceiptImportPayload;
  /**
   * Called after the user taps through. The parent drops the row optimistically;
   * the read-mark rides along in the background.
   */
  onResolve: (id: string) => void;
}

/**
 * A single in-app "your forwarded receipt landed as drafts" heads-up — the async
 * counterpart to the in-flow paste toast. Deliberately quieter than a price drop:
 * no thumbnail, no dual actions, just the server-rendered line and a way in. The
 * whole card is one tap-through to `/closet`, where the drafts are waiting; the
 * tap marks the notification read in the background so the (client-side) nav
 * never waits on it. Copy is carried in `payload.message` (Quill's
 * {@link strings.settings.receiptAddress.newDrafts}); every dimension/colour is a
 * token, and motion collapses under reduced-motion.
 */
export function ReceiptImportCard({ id, payload, onResolve }: ReceiptImportCardProps) {
  const reduced = useReducedMotion();

  /** Tapping through retires the row and marks it read; the read never blocks nav. */
  function resolve() {
    void markRead(id).catch(() => {
      /* swallow — a failed read-mark must never surface; the row is gone locally */
    });
    onResolve(id);
  }

  return (
    <motion.div
      style={cardStyle}
      initial={reduced ? undefined : { opacity: 0, y: 8 }}
      animate={reduced ? undefined : { opacity: 1, y: 0 }}
      exit={reduced ? undefined : { opacity: 0, y: -8 }}
      transition={transitionFor(motionToken.springs.gentle, reduced)}
    >
      <Link href="/closet" onClick={resolve} style={linkStyle}>
        <Text variant="ui" as="p" size="subhead" weight={500} style={{ margin: 0, minWidth: 0, color: 'var(--color-text)' }}>{payload.message}</Text>
        <Text variant="ui" as="span" size="body" style={{ flexShrink: '0' as CSSProperties['flexShrink'], color: 'var(--color-secondary-strong)' }} aria-hidden="true">
          →
        </Text>
      </Link>
    </motion.div>
  );
}

const cardStyle: CSSProperties = {
  background: 'var(--color-surface)',
  borderRadius: 'var(--radius-card)',
  boxShadow: 'var(--shadow-e1)',
  isolation: 'isolate',
};

const linkStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--space-3)',
  padding: 'var(--space-3)',
  minHeight: 'var(--touch-target-min)',
  textDecoration: 'none',
  color: 'inherit',
};

