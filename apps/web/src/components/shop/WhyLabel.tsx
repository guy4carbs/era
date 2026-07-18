import { type CSSProperties } from 'react';
import { strings } from '@era/core/strings';
import { Text } from '../Text';
import type { ProductWhy } from '@era/core/shop';

export interface WhyLabelProps {
  /** The single most salient reason the ranker surfaced this pick, or null. */
  why: ProductWhy | null;
}

/**
 * The one-line "why" on a ranked pick — Ovi's honest reason, rendered per
 * Quill's copy fns. Two visual registers, and the split is the whole point:
 *
 *   - `fills_gap` / `completes_outfits` are quiet POSITIVE pulls — muted
 *     secondary text with a small accent dot. Understated on purpose; Shop is
 *     not a marketplace shouting a sale.
 *   - `similar_owned` is an honest WARNING, not a pitch. The caution signal is
 *     carried by a warm `rust` marker + a faint rust border/wash, while the
 *     SENTENCE itself is `--color-text` (theme-aware, high-contrast). The small
 *     body copy is never colored `rust`: that value is tuned to clear 3:1 on the
 *     LIGHT bg only and would fail WCAG AA (4.5:1) on the dark bg — and the most
 *     important line on the surface must stay legible in both modes. (Matches
 *     mobile.) It is still visibly a warning, and never a positive-styled reason.
 *
 * No `why` → nothing renders. We never fabricate a reason to fill the slot.
 */
export function WhyLabel({ why }: WhyLabelProps) {
  if (why === null) {
    return null;
  }

  if (why.kind === 'similar_owned') {
    return (
      <Text variant="caption" as="p" size="footnote" weight={600} style={warningStyle}>
        <span aria-hidden="true" style={warningDotStyle} />
        {strings.shop.whySimilarOwned(why.ownedCount)}
      </Text>
    );
  }

  const text =
    why.kind === 'fills_gap'
      ? strings.shop.whyFillsGap(strings.closet.categoryLabel(why.category).toLowerCase())
      : strings.shop.whyCompletesOutfits(why.count);

  return (
    <Text variant="caption" as="p" size="footnote" weight={600} style={positiveStyle}>
      <span aria-hidden="true" style={positiveDotStyle} />
      {text}
    </Text>
  );
}

const lineBase: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-1)',
  margin: 0,
};

const positiveStyle: CSSProperties = {
  ...lineBase,
  color: 'var(--color-secondary-strong)',
};

const warningStyle: CSSProperties = {
  ...lineBase,
  // Sentence stays high-contrast + theme-aware (AA in both modes). The caution
  // is carried by the rust dot + a faint rust left-border and wash, NOT by
  // coloring the small text rust (which fails AA on the dark bg).
  color: 'var(--color-text)',
  paddingBlock: 'var(--space-1)',
  paddingInline: 'var(--space-2)',
  borderRadius: 'var(--radius-chip)',
  borderLeft: '2px solid var(--color-rust)',
  background: 'color-mix(in srgb, var(--color-rust) 8%, transparent)',
};

const dotBase: CSSProperties = {
  flex: '0 0 auto',
  width: 'var(--space-1)',
  height: 'var(--space-1)',
  borderRadius: 'var(--radius-full)',
};

const positiveDotStyle: CSSProperties = { ...dotBase, background: 'var(--color-accent)' };
const warningDotStyle: CSSProperties = { ...dotBase, background: 'var(--color-rust)' };
