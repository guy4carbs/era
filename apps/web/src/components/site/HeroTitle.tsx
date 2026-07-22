import { type CSSProperties } from 'react';
import { strings } from '@era/core/strings';
import { typeRamp } from '@era/tokens';
import { Text } from '../Text';
import { splitHeroTitle } from '../../lib/hero-title';

/**
 * The landing h1, split into two rising lines. A SERVER component — the LCP
 * element ships fully rendered with no client island, and the per-line rise is a
 * pure CSS keyframe (`.era-hero-line`, see globals.css) staggered by
 * `--hero-line-index`. The copy is never authored as two strings: the lines come
 * from splitting the single locked `strings.site.hero.title` (see
 * {@link splitHeroTitle} + its test), so they always rejoin to the approved
 * title. Under reduced motion the keyframe is a no-op and both lines are static.
 */

const displayLineHeight = typeRamp.display.lineHeight / typeRamp.display.px;

const titleStyle: CSSProperties = {
  margin: 0,
  lineHeight: displayLineHeight,
  color: 'var(--color-text)',
  maxWidth: '14ch',
};

// Each line is a block span carrying the CSS entrance; `--hero-line-index` sets
// its stagger position. Type set — the outer <Text variant="display"> supplies
// the face/axes; the spans only lay out + animate.
const lineBaseStyle: CSSProperties = {
  display: 'block',
};

export function HeroTitle() {
  const [first, second] = splitHeroTitle(strings.site.hero.title);
  const lines = second ? [first, second] : [first];

  return (
    <Text variant="display" as="h1" style={titleStyle}>
      {lines.map((line, index) => (
        <span
          key={line}
          className="era-hero-line"
          style={{ ...lineBaseStyle, ['--hero-line-index' as string]: index }}
        >
          {line}
        </span>
      ))}
    </Text>
  );
}
