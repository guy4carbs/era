'use client';

import { type CSSProperties } from 'react';
import { boxShadows } from '@era/tokens';
import { strings } from '@era/core/strings';
import type { MonthlyRecap } from '@era/core/wear-stats';
import { formatMoney } from '../../lib/format-money';
import { Text } from '../Text';
import type { WornItem } from './types';

export interface MonthlyRecapCardProps {
  /** The computed recap for the viewed month (from `buildMonthlyRecap`). */
  recap: MonthlyRecap;
  /** Owned pieces referenced by the month, for resolving thumbnails + names. */
  itemsById: ReadonlyMap<string, WornItem>;
  /** The month rendered as a display label, e.g. "July 2026". */
  monthLabel: string;
}

/** Lowercased, singular-or-plural category label for mid-sentence copy. */
function categoryLower(category: string): string {
  return strings.closet.categoryLabel(category).toLowerCase();
}

/**
 * "Your month, worn" — the screenshot-shareable recap. A self-contained bordered
 * card carrying the Era wordmark, the month, and only the stats the month's logs
 * exactly support (total wears, days dressed, most-worn pieces, most-worn
 * category, best cost per wear). Every colour is a theme token, so the same card
 * reads cleanly screenshotted in light OR dark — no share button needed, the
 * design IS the artifact. An empty month still renders a handsome card with a
 * warm "fills in as you go" line. All copy is Quill's `strings.wear.recap`.
 */
export function MonthlyRecapCard({ recap, itemsById, monthLabel }: MonthlyRecapCardProps) {
  const copy = strings.wear.recap;
  const isEmpty = recap.totalWears === 0;

  const bestItem = recap.bestCostPerWear
    ? itemsById.get(recap.bestCostPerWear.itemId)
    : undefined;

  return (
    <section style={cardStyle} aria-label={copy.title}>
      <header style={headerStyle}>
        {/* Axiom spec (kept in lockstep with mobile): quiet letterspaced
            uppercase 'ERA' mark in accent, with the month prominent in text
            colour directly below it. */}
        <Text
          variant="caption"
          size="footnote"
          weight={700}
          as="span"
          style={{ letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--color-accent)' }}
        >
          Era
        </Text>
        <Text
          variant="ui"
          size="title3"
          weight={700}
          as="span"
          style={{ letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text)' }}
        >
          {copy.monthHeader(monthLabel)}
        </Text>
      </header>

      <Text variant="title" size="title1" weight={700} as="h2" style={{ margin: 0, color: 'var(--color-text)' }}>
        {copy.title}
      </Text>

      {isEmpty ? (
        <Text variant="body" as="p" style={{ margin: 0, color: 'var(--color-secondary-strong)' }}>
          {copy.empty}
        </Text>
      ) : (
        <div style={statsStyle}>
          <Text variant="ui" size="title3" weight={700} as="p" style={{ margin: 0, color: 'var(--color-text)' }}>
            {copy.totalWears(recap.totalWears)}
          </Text>
          <Text variant="body" size="subhead" as="p" style={{ margin: 0, color: 'var(--color-secondary-strong)' }}>
            {copy.daysDressed(recap.distinctDaysWorn, recap.daysInMonth)}
          </Text>

          {recap.topItems.length > 0 ? (
            <div style={topBlockStyle}>
              <Text
                variant="caption"
                size="footnote"
                weight={700}
                as="span"
                style={{ letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--color-secondary-strong)' }}
              >
                {copy.topPieces}
              </Text>
              <ul style={thumbRowStyle}>
                {recap.topItems.map((top) => {
                  const item = itemsById.get(top.itemId);
                  return (
                    <li key={top.itemId} style={thumbCellStyle}>
                      <span style={thumbFrameStyle}>
                        {item?.imageUrl ? (
                          <img src={item.imageUrl} alt={item.name} style={thumbImageStyle} />
                        ) : null}
                      </span>
                      <Text variant="caption" size="footnote" weight={600} as="span" style={{ color: 'var(--color-text)' }}>
                        ×{top.wearCount}
                      </Text>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          {recap.mostWornCategory ? (
            <Text variant="body" size="subhead" as="p" style={{ margin: 0, color: 'var(--color-secondary-strong)' }}>
              {copy.mostWornCategory(categoryLower(recap.mostWornCategory))}
            </Text>
          ) : null}

          {recap.bestCostPerWear ? (
            <Text variant="body" size="subhead" as="p" style={{ margin: 0, color: 'var(--color-secondary-strong)' }}>
              {copy.bestCostPerWear(
                formatMoney(recap.bestCostPerWear.costPerWear),
                bestItem?.name ?? categoryLower(recap.bestCostPerWear.category),
              )}
            </Text>
          ) : null}
        </div>
      )}

      <footer style={footerStyle}>
        <Text
          variant="caption"
          weight={600}
          as="span"
          style={{ letterSpacing: '0.04em', color: 'var(--color-secondary-strong)' }}
        >
          {copy.shareTag}
        </Text>
      </footer>
    </section>
  );
}

// The card is the shareable artifact: a bordered, elevated surface on theme
// tokens so a screenshot reads cleanly in light and dark alike.
const cardStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
  padding: 'var(--space-6)',
  background: 'var(--color-surface)',
  border: '1px solid var(--color-hairline)',
  borderRadius: 'var(--radius-card)',
  boxShadow: boxShadows.e2,
};

// Mark stacked directly above the month, left-aligned.
const headerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-1)',
};

const statsStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
};

const topBlockStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
};

const thumbRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--space-3)',
  margin: 0,
  padding: 0,
  listStyle: 'none',
};

const thumbCellStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 'var(--space-1)',
};

const thumbFrameStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 'var(--space-16)',
  height: 'var(--space-16)',
  padding: 'var(--space-2)',
  borderRadius: 'var(--radius-chip)',
  background: 'var(--color-bg)',
  border: '1px solid var(--color-hairline)',
};

const thumbImageStyle: CSSProperties = {
  maxWidth: '100%',
  maxHeight: '100%',
  objectFit: 'contain',
};

const footerStyle: CSSProperties = {
  paddingTop: 'var(--space-3)',
  borderTop: '1px solid var(--color-hairline)',
};
