import { type CSSProperties } from 'react';
import { strings } from '@era/core/strings';
import { Text } from '../Text';

/**
 * A horizontal scroll-snap rail of the six style "eras" (the quiz mood cards).
 * A zero-JS Server Component — native `overflow-x: auto` with CSS scroll-snap,
 * made keyboard-scrollable via `tabIndex` + an `aria-label`. Each card is a
 * fixed box (fixed width + reserved min-height) so the rail can't reflow the
 * page as it renders (CLS 0). The era title is set in Ovi's editorial accent
 * (Fraunces Italic, `oviAccent`); the tagline is quiet body.
 */

const railStyle: CSSProperties = {
  display: 'flex',
  gap: 'var(--space-4)',
  overflowX: 'auto',
  scrollSnapType: 'x mandatory',
  paddingBottom: 'var(--space-2)',
  // Let the rail bleed to the container edges for an editorial feel.
  marginInline: 'calc(-1 * var(--space-4))',
  paddingInline: 'var(--space-4)',
  WebkitOverflowScrolling: 'touch',
};

const cardStyle: CSSProperties = {
  scrollSnapAlign: 'start',
  flex: 'none',
  // Fixed card box: the feed-column token width, with a reserved height so the
  // rail's footprint is stable before/after paint.
  width: 'var(--feed-col)',
  minHeight: 'var(--feed-col)',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'flex-end',
  gap: 'var(--space-2)',
  padding: 'var(--space-6)',
  borderRadius: 'var(--radius-hero)',
  background: 'var(--color-surface)',
  border: '1px solid var(--color-hairline)',
  boxShadow: 'var(--shadow-e2)',
};

const titleStyle: CSSProperties = {
  margin: 0,
  color: 'var(--color-text)',
};

const taglineStyle: CSSProperties = {
  margin: 0,
  color: 'var(--color-secondary-strong)',
};

export function EraCarousel() {
  // Declaration order of the mood map is the stable rail order.
  const eras = Object.values(strings.quiz.moods);

  return (
    <div
      style={railStyle}
      tabIndex={0}
      role="group"
      aria-label="The style eras you can enter"
    >
      {eras.map((era) => (
        <article key={era.title} style={cardStyle}>
          <Text variant="oviAccent" as="h3" size="title2" style={titleStyle}>
            {era.title}
          </Text>
          <Text variant="body" as="p" style={taglineStyle}>
            {era.tagline}
          </Text>
        </article>
      ))}
    </div>
  );
}
