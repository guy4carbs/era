'use client';

import { type CSSProperties } from 'react';
import { boxShadows, typeRamp } from '@era/tokens';
import { strings } from '@era/core/strings';
import type { MonthlyRecap } from '@era/core/wear-stats';
import { formatMoney } from '../../lib/format-money';
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
        <span style={wordmarkStyle}>Era</span>
        <span style={monthStyle}>{copy.monthHeader(monthLabel)}</span>
      </header>

      <h2 style={titleStyle}>{copy.title}</h2>

      {isEmpty ? (
        <p style={emptyStyle}>{copy.empty}</p>
      ) : (
        <div style={statsStyle}>
          <p style={leadStatStyle}>{copy.totalWears(recap.totalWears)}</p>
          <p style={subStatStyle}>{copy.daysDressed(recap.distinctDaysWorn, recap.daysInMonth)}</p>

          {recap.topItems.length > 0 ? (
            <div style={topBlockStyle}>
              <span style={sectionLabelStyle}>{copy.topPieces}</span>
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
                      <span style={thumbCountStyle}>×{top.wearCount}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          {recap.mostWornCategory ? (
            <p style={subStatStyle}>{copy.mostWornCategory(categoryLower(recap.mostWornCategory))}</p>
          ) : null}

          {recap.bestCostPerWear ? (
            <p style={subStatStyle}>
              {copy.bestCostPerWear(
                formatMoney(recap.bestCostPerWear.costPerWear),
                bestItem?.name ?? categoryLower(recap.bestCostPerWear.category),
              )}
            </p>
          ) : null}
        </div>
      )}

      <footer style={footerStyle}>{copy.shareTag}</footer>
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

const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  gap: 'var(--space-3)',
};

// The Era wordmark — a quiet brand mark, letterspaced small caps.
const wordmarkStyle: CSSProperties = {
  fontSize: typeRamp.subhead.rem,
  lineHeight: `${typeRamp.subhead.lineHeight}px`,
  fontWeight: 700,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: 'var(--color-accent)',
};

const monthStyle: CSSProperties = {
  fontSize: typeRamp.footnote.rem,
  lineHeight: `${typeRamp.footnote.lineHeight}px`,
  fontWeight: 600,
  color: 'var(--color-secondary-strong)',
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: typeRamp.title1.rem,
  lineHeight: `${typeRamp.title1.lineHeight}px`,
  fontWeight: 700,
  color: 'var(--color-text)',
};

const statsStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
};

const leadStatStyle: CSSProperties = {
  margin: 0,
  fontSize: typeRamp.title3.rem,
  lineHeight: `${typeRamp.title3.lineHeight}px`,
  fontWeight: 700,
  color: 'var(--color-text)',
};

const subStatStyle: CSSProperties = {
  margin: 0,
  fontSize: typeRamp.subhead.rem,
  lineHeight: `${typeRamp.subhead.lineHeight}px`,
  color: 'var(--color-secondary-strong)',
};

const topBlockStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
};

const sectionLabelStyle: CSSProperties = {
  fontSize: typeRamp.footnote.rem,
  lineHeight: `${typeRamp.footnote.lineHeight}px`,
  fontWeight: 700,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: 'var(--color-secondary-strong)',
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

const thumbCountStyle: CSSProperties = {
  fontSize: typeRamp.footnote.rem,
  lineHeight: `${typeRamp.footnote.lineHeight}px`,
  fontWeight: 600,
  color: 'var(--color-text)',
};

const emptyStyle: CSSProperties = {
  margin: 0,
  fontSize: typeRamp.body.rem,
  lineHeight: `${typeRamp.body.lineHeight}px`,
  color: 'var(--color-secondary-strong)',
};

const footerStyle: CSSProperties = {
  paddingTop: 'var(--space-3)',
  borderTop: '1px solid var(--color-hairline)',
  fontSize: typeRamp.caption.rem,
  lineHeight: `${typeRamp.caption.lineHeight}px`,
  fontWeight: 600,
  letterSpacing: '0.04em',
  color: 'var(--color-secondary-strong)',
};
