'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { motion as motionToken, typeRamp } from '@era/tokens';
import { strings } from '@era/core/strings';
import type { WardrobeGap } from '@era/core/shop';
import { transitionFor } from '../../lib/motion';
import { getWardrobeGaps } from '../../lib/shop-client';

export interface GapsHeroProps {
  /**
   * Apply a gap's pre-filtered {@link WardrobeGap.suggestedQuery} to the Shop
   * filters and re-run the search. The parent owns the filter state, so this drops
   * the user into a Shop view scoped to the gap's category (and any implied tier).
   */
  onFill: (gap: WardrobeGap) => void;
}

/**
 * The restrained gaps hero at the top of the Shop tab: the honest answer to
 * "what am I missing?". It fetches the user's GENUINE wardrobe gaps once on mount,
 * non-blocking — a failure renders nothing and never disturbs the browse grid
 * below. The engine already caps the list (≤5) and returns few gaps, often none,
 * so we render exactly what it hands back: no "show more", no manufactured need.
 *
 * States, all quiet:
 *   - loading / failed → `null` (we don't know yet, or we couldn't ask — say nothing).
 *   - covered closet (0 gaps) → one warm affirming line ({@link strings.shop.gaps.empty}).
 *   - real gaps → title, intro, and one honest card per gap.
 *
 * Each card carries the gap's honest sentence, its unlock badge, and a single
 * "Fill this gap" action that pre-filters the Shop to that category.
 */
export function GapsHero({ onFill }: GapsHeroProps) {
  const reduced = useReducedMotion();
  // `null` = not yet loaded OR the fetch failed; either way we render nothing. An
  // empty array is a real, known answer (a covered closet) and reads as such.
  const [gaps, setGaps] = useState<WardrobeGap[] | null>(null);

  useEffect(() => {
    let active = true;
    getWardrobeGaps()
      .then((result) => {
        if (active) setGaps(result);
      })
      .catch(() => {
        /* stay silent — a gaps miss must never break browse */
      });
    return () => {
      active = false;
    };
  }, []);

  // Not loaded / failed: show nothing. Restraint over a spinner above the grid.
  if (gaps === null) {
    return null;
  }

  // Covered closet — the brand's whole point. One quiet, honest line, no nudge.
  if (gaps.length === 0) {
    return <p style={emptyStyle}>{strings.shop.gaps.empty}</p>;
  }

  return (
    <motion.section
      aria-labelledby="era-gaps-title"
      style={sectionStyle}
      initial={reduced ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={transitionFor(motionToken.springs.gentle, reduced)}
    >
      <div style={introBlockStyle}>
        <h2 id="era-gaps-title" style={titleStyle}>
          {strings.shop.gaps.title}
        </h2>
        <p style={introStyle}>{strings.shop.gaps.intro}</p>
      </div>

      <ul style={listStyle}>
        {gaps.map((gap) => (
          <li key={gap.category} style={cardStyle}>
            <p style={reasonStyle}>{strings.shop.gaps.reason(gap)}</p>
            <div style={footerStyle}>
              <span style={unlocksStyle}>{strings.shop.gaps.unlocksLabel(gap.unlocksOutfits)}</span>
              <button type="button" style={fillStyle} onClick={() => onFill(gap)}>
                {strings.shop.gaps.fillCta}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </motion.section>
  );
}

const sectionStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
};

const introBlockStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-1)',
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: typeRamp.title3.rem,
  lineHeight: `${typeRamp.title3.lineHeight}px`,
  fontWeight: 700,
  color: 'var(--color-text)',
};

const introStyle: CSSProperties = {
  margin: 0,
  fontSize: typeRamp.footnote.rem,
  lineHeight: `${typeRamp.footnote.lineHeight}px`,
  color: 'var(--color-secondary-strong)',
};

const listStyle: CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
};

const cardStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
  padding: 'var(--space-4)',
  background: 'var(--color-surface)',
  border: '1px solid var(--color-hairline)',
  borderRadius: 'var(--radius-card)',
};

const reasonStyle: CSSProperties = {
  margin: 0,
  fontSize: typeRamp.body.rem,
  lineHeight: `${typeRamp.body.lineHeight}px`,
  color: 'var(--color-text)',
};

const footerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--space-3)',
  minHeight: 'var(--touch-target-min)',
};

const unlocksStyle: CSSProperties = {
  fontSize: typeRamp.footnote.rem,
  fontWeight: 600,
  color: 'var(--color-secondary-strong)',
};

const fillStyle: CSSProperties = {
  flex: '0 0 auto',
  border: 'none',
  background: 'transparent',
  padding: 0,
  cursor: 'pointer',
  fontSize: typeRamp.footnote.rem,
  fontWeight: 600,
  color: 'var(--color-accent)',
};

const emptyStyle: CSSProperties = {
  margin: 0,
  fontSize: typeRamp.body.rem,
  lineHeight: `${typeRamp.body.lineHeight}px`,
  color: 'var(--color-secondary-strong)',
};
