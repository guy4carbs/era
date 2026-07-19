'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { strings } from '@era/core/strings';
import { Text } from '../Text';
import { costPerWear } from '@era/core/wear-stats';
import { formatMoney } from '../../lib/format-money';
import { WoreItButton } from '../ovi/WoreItButton';
import type { GalleryItem } from './types';

export interface ItemWearStatsProps {
  /** The piece whose wear stats are shown; seeds the count with no flash. */
  item: GalleryItem;
}

/** Stats for one owned piece: how often it's been worn and its cost per wear.
 *  `wearCount` is null until the authoritative stats read lands. */
interface Stats {
  wearCount: number;
  purchasePrice: string | null;
}

const blockStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
};

const rowStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-1)',
};

// The cost-per-wear figure: serif numerals stacked over their quiet label, held
// tight so they read as one editorial unit within the wear-stats row.
const cpwBlockStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-1)',
};

/**
 * The item-detail wear stats block: a natural-language wear count, the piece's
 * cost per wear (or a gentle invite to add its price), and a one-tap "Wore it
 * today" action. Seeds from the gallery row's own `wearCount`/`purchasePrice` so
 * it lands without a flash, then reconciles against `GET /api/wear-logs/stats`
 * (the authoritative owner-scoped read). Logging a wear here bumps the count
 * locally, so cost per wear visibly ticks down the moment the piece is worn —
 * the loop's payoff, felt immediately. All copy is Quill's `strings.wear`.
 */
export function ItemWearStats({ item }: ItemWearStatsProps) {
  const [stats, setStats] = useState<Stats>({
    wearCount: item.wearCount,
    purchasePrice: item.purchasePrice,
  });
  const [logFailed, setLogFailed] = useState(false);

  // Reconcile against the authoritative stats read; a failure keeps the seeded
  // values (the list route's correlated count is already accurate at load).
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const res = await fetch(`/api/wear-logs/stats?itemId=${item.id}`);
        if (!res.ok) return;
        const body = (await res.json()) as { wearCount: number; purchasePrice: string | null };
        if (active) setStats({ wearCount: body.wearCount, purchasePrice: body.purchasePrice });
      } catch {
        // Leave the seeded values in place — nothing to correct.
      }
    })();
    return () => {
      active = false;
    };
  }, [item.id]);

  // A usable price is one costPerWear accepts (positive, parseable); probe with a
  // wear count of 1 so the check is about the price alone.
  const priceUsable = costPerWear(stats.purchasePrice, 1) !== null;
  const cpw = costPerWear(stats.purchasePrice, stats.wearCount);

  return (
    <div style={blockStyle}>
      <div style={rowStyle}>
        <Text variant="body" weight={600} as="p" style={{ margin: 0, color: 'var(--color-text)' }}>
          {strings.wear.count(stats.wearCount)}
        </Text>
        {priceUsable ? (
          // A real cost per wear reads as an editorial figure: the amount in
          // Fraunces numerals (title role) with a quiet "per wear" caption
          // beneath. A null cpw renders NOTHING — absence over a dash.
          cpw !== null ? (
            <div style={cpwBlockStyle}>
              <Text variant="title" as="span" style={{ margin: 0, color: 'var(--color-text)' }}>
                {formatMoney(cpw, item.currency)}
              </Text>
              <Text variant="caption" size="footnote" as="span" style={{ margin: 0, color: 'var(--color-secondary-strong)' }}>
                {strings.closet.costPerWearLabel}
              </Text>
            </div>
          ) : null
        ) : (
          <Text variant="caption" size="subhead" as="p" style={{ margin: 0, color: 'var(--color-secondary-strong)' }}>
            {strings.wear.costPerWearUnknown}
          </Text>
        )}
      </div>

      <WoreItButton
        itemIds={[item.id]}
        via="item_detail"
        confirmedLabel={strings.wear.logged}
        onLogged={() => {
          setLogFailed(false);
          setStats((prev) => ({ ...prev, wearCount: prev.wearCount + 1 }));
        }}
        onError={() => setLogFailed(true)}
      />

      {logFailed ? (
        <Text variant="caption" size="footnote" as="p" style={{ margin: 0, color: 'var(--color-secondary-strong)' }}>
          {strings.wear.logFailed}
        </Text>
      ) : null}
    </div>
  );
}
