'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useSession } from '../../lib/auth-client';
import {
  isPriceDrop,
  listNotifications,
  type AppNotification,
  type PriceDropPayload,
} from '../../lib/notifications-client';
import { PriceDropCard } from './PriceDropCard';

interface PriceDropRow {
  readonly id: string;
  readonly payload: PriceDropPayload;
}

/** Keep only unread price-drop rows, in the order the route returned them. */
function toRows(notifications: AppNotification[]): PriceDropRow[] {
  return notifications
    .filter((n) => n.readAt === null && isPriceDrop(n))
    .map((n) => ({ id: n.id, payload: (n as { payload: PriceDropPayload }).payload }));
}

/**
 * The Feed's price-drop surface: the quiet in-app companion to the email/push
 * alerts. On mount (once signed in) it pulls the user's notifications and renders
 * every unread `price_drop` as a {@link PriceDropCard}. Acting on a card (view or
 * dismiss) drops it locally and marks it read server-side. When there's nothing
 * to show — signed out, no drops, a failed fetch — the surface renders nothing at
 * all, so it never adds empty chrome to the Feed. Sits alongside the Today card.
 */
export function PriceDropFeed() {
  const { data: session, isPending } = useSession();
  const [rows, setRows] = useState<PriceDropRow[]>([]);

  useEffect(() => {
    if (isPending || !session) return;
    let active = true;
    void (async () => {
      try {
        const notifications = await listNotifications();
        if (active) setRows(toRows(notifications));
      } catch {
        // A failed fetch simply leaves the surface empty — no error chrome here.
      }
    })();
    return () => {
      active = false;
    };
  }, [isPending, session]);

  if (!session || rows.length === 0) return null;

  return (
    <section style={sectionStyle} aria-label="Price-drop alerts">
      <div style={listStyle}>
        <AnimatePresence initial={false}>
          {rows.map((row) => (
            <PriceDropCard
              key={row.id}
              id={row.id}
              payload={row.payload}
              onResolve={(id) => setRows((prev) => prev.filter((r) => r.id !== id))}
            />
          ))}
        </AnimatePresence>
      </div>
    </section>
  );
}

const sectionStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
};

const listStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
};
