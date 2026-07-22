'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { motion as motionToken } from '@era/tokens';
import { strings } from '@era/core/strings';
import { Text } from '../Text';
import type { WardrobeGap } from '@era/core/shop';
import { pressProps, transitionFor } from '../../lib/motion';
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
 * The restrained gaps block at the top of the Shop tab: the honest answer to
 * "what am I missing?", styled as a D8 EDITORIAL block, not a banner. It fetches
 * the user's GENUINE wardrobe gaps once on mount, non-blocking — a failure
 * renders nothing and never disturbs the browse grid below. The engine already
 * caps the list (≤5) and returns few gaps, often none, so we render exactly what
 * it hands back: no "show more", no manufactured need.
 *
 * States, all quiet:
 *   - loading / failed → `null` (we don't know yet, or we couldn't ask — say nothing).
 *   - covered closet (0 gaps) → one warm affirming line ({@link strings.shop.gaps.empty}).
 *   - real gaps → the Fraunces-Italic deck line + its hairline rule (the closet's
 *     editorial section grammar), then one honest gap per row.
 *
 * Each gap reads as an editorial line — no box, no fill — carrying its honest
 * sentence, its unlock note, and a single quiet "Fill this gap" action that
 * pre-filters the Shop to that category. It introduces the gaps the way a
 * magazine deck line introduces a section, not the way a banner shouts one.
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
    return <Text variant="body" as="p" style={{ margin: 0, color: 'var(--color-secondary-strong)' }}>{strings.shop.gaps.empty}</Text>;
  }

  return (
    <motion.section
      aria-labelledby="era-gaps-title"
      style={sectionStyle}
      initial={reduced ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={transitionFor(motionToken.springs.gentle, reduced)}
    >
      {/* The editorial deck: the Fraunces-Italic lead line with its hairline rule
          filling the row (the closet's section grammar), then the quiet intro. No
          banner box, no fill — a magazine deck introducing the gaps. */}
      <div style={introBlockStyle}>
        <div style={headingRowStyle}>
          <Text variant="oviAccent" as="h2" id="era-gaps-title" style={{ margin: 0, color: 'var(--color-text)' }}>
            {strings.shop.gaps.title}
          </Text>
          <span aria-hidden="true" style={hairlineRuleStyle} />
        </div>
        <Text variant="body" as="p" size="footnote" style={{ margin: 0, color: 'var(--color-secondary-strong)' }}>{strings.shop.gaps.intro}</Text>
      </div>

      <ul style={listStyle}>
        {gaps.map((gap, index) => (
          // The rule sits BETWEEN gaps; the last row sheds it so the block ends clean.
          <li
            key={gap.category}
            style={index === gaps.length - 1 ? lastRowStyle : rowStyle}
          >
            <Text variant="body" as="p" style={{ margin: 0, color: 'var(--color-text)' }}>{strings.shop.gaps.reason(gap)}</Text>
            <div style={footerStyle}>
              <Text variant="ui" as="span" size="footnote" weight={600} style={{ color: 'var(--color-secondary-strong)' }}>{strings.shop.gaps.unlocksLabel(gap.unlocksOutfits)}</Text>
              <motion.button type="button" style={fillStyle} onClick={() => onFill(gap)} {...pressProps(reduced)}>
                <Text variant="ui" as="span" size="footnote" weight={600} style={{ color: 'var(--color-accent)' }}>
                  {strings.shop.gaps.fillCta}
                </Text>
              </motion.button>
            </div>
          </li>
        ))}
      </ul>
    </motion.section>
  );
}

// The whole block breathes on the section rhythm — deck then gaps, generously
// spaced, no container.
const sectionStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
};

const introBlockStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
};

// The editorial section heading: the italic serif lead line left, a hairline
// rule filling the row to the right (ClosetGallery's sectionHeadingStyle).
const headingRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-3)',
};

const hairlineRuleStyle: CSSProperties = {
  flex: 1,
  height: 'var(--glass-border-width)',
  background: 'var(--color-hairline)',
};

const listStyle: CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-5)',
};

// Each gap is an editorial line, not a card: the honest sentence over its
// unlock/CTA footer, separated from the next by a hairline rule (no box, no fill).
const rowStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
  paddingBottom: 'var(--space-5)',
  borderBottom: '1px solid var(--color-hairline)',
};

// The final gap ends the block — same line rhythm, no trailing rule.
const lastRowStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
};

const footerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--space-3)',
  minHeight: 'var(--touch-target-min)',
};

const fillStyle: CSSProperties = {
  flex: '0 0 auto',
  border: 'none',
  background: 'transparent',
  padding: 0,
  cursor: 'pointer',
};
