'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { AnimatePresence } from 'motion/react';
import { useSession } from '../../lib/auth-client';
import {
  isPriceDrop,
  isReceiptImport,
  listNotifications,
  type AppNotification,
  type PriceDropPayload,
  type ReceiptImportPayload,
} from '../../lib/notifications-client';
import { PriceDropCard } from './PriceDropCard';
import { ReceiptImportCard } from './ReceiptImportCard';

/** One renderable, unread notification, discriminated by the card it maps to. */
type FeedRow =
  | { readonly kind: 'price_drop'; readonly id: string; readonly payload: PriceDropPayload }
  | { readonly kind: 'receipt_import'; readonly id: string; readonly payload: ReceiptImportPayload };

/** Keep only unread rows we know how to render, in the order the route returned them. */
function toRows(notifications: AppNotification[]): FeedRow[] {
  const rows: FeedRow[] = [];
  for (const n of notifications) {
    if (n.readAt !== null) continue;
    if (isPriceDrop(n)) {
      rows.push({ kind: 'price_drop', id: n.id, payload: n.payload });
    } else if (isReceiptImport(n)) {
      rows.push({ kind: 'receipt_import', id: n.id, payload: n.payload });
    }
    // Unknown kinds carry an opaque payload and are simply skipped.
  }
  return rows;
}

/**
 * The Feed's in-app notification surface: the quiet companion to the email/push
 * channels. On mount (once signed in) it pulls the user's notifications and
 * renders each unread row through its matching card — a {@link PriceDropCard} for
 * price drops, a {@link ReceiptImportCard} for forwarded-receipt drafts. Acting on
 * a card (view or dismiss) drops it locally and marks it read server-side. When
 * there's nothing to show — signed out, nothing unread, a failed fetch — the
 * surface renders nothing at all, so it never adds empty chrome. Sits alongside
 * the Today card.
 */
export function NotificationFeed() {
  const { data: session, isPending } = useSession();
  const [rows, setRows] = useState<FeedRow[]>([]);

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

  const remove = (id: string) => setRows((prev) => prev.filter((r) => r.id !== id));

  return (
    <section style={sectionStyle} aria-label="Notifications">
      <div style={listStyle}>
        <AnimatePresence initial={false}>
          {rows.map((row) =>
            row.kind === 'price_drop' ? (
              <PriceDropCard key={row.id} id={row.id} payload={row.payload} onResolve={remove} />
            ) : (
              <ReceiptImportCard key={row.id} id={row.id} payload={row.payload} onResolve={remove} />
            ),
          )}
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
