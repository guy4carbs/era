import { type CSSProperties } from 'react';
import { strings } from '@era/core/strings';
import { typeRamp } from '@era/tokens';
import { Text } from '../Text';
import { EraMark } from '../EraMark';
import { HeroGlow } from './HeroGlow';
import { HeroTitle } from './HeroTitle';
import { WaitlistForm } from './WaitlistForm';

/**
 * Full-bleed landing hero: the promise as a two-line rising serif over a soft
 * accent bloom, the elaboration in Geist, and the waitlist capture inline as the
 * glass `bar`. Mostly a Server Component — only the glow bloom ({@link HeroGlow})
 * and the waitlist form ({@link WaitlistForm}) are client islands; the LCP h1
 * ({@link HeroTitle}) is fully server-rendered and rises via a pure CSS keyframe.
 *
 * The sub-line fades in after the title's two lines by reusing the same
 * `.era-hero-line` entrance at the next stagger index — one token-derived
 * cascade, no separate timing. Under reduced motion the entrance is a no-op.
 */

const subLineHeight = typeRamp.title3.lineHeight / typeRamp.title3.px;

const sectionStyle: CSSProperties = {
  position: 'relative',
  overflow: 'hidden',
  isolation: 'isolate',
  minHeight: '100svh',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  textAlign: 'center',
  paddingInline: 'var(--space-6)',
  paddingBlock: 'var(--space-16)',
  background: 'var(--color-bg)',
};

const innerStyle: CSSProperties = {
  position: 'relative',
  zIndex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 'var(--space-6)',
  maxWidth: 'var(--content-max)',
};

const subStyle: CSSProperties = {
  margin: 0,
  fontSize: `clamp(${typeRamp.body.rem}, 2.5vw, ${typeRamp.title3.rem})`,
  lineHeight: subLineHeight,
  color: 'var(--color-secondary-strong)',
  maxWidth: '46ch',
};

// Constrain the inline waitlist bar to a comfortable single column.
const formWrapStyle: CSSProperties = {
  width: '100%',
  maxWidth: 'var(--feed-col)',
  marginTop: 'var(--space-2)',
};

export function Hero() {
  return (
    <section style={sectionStyle}>
      <HeroGlow />
      <div style={innerStyle}>
        {/* The locked mark, modest above the display title. Server-rendered, so the
            per-mode ink comes from the reactive --color-mark-onbg var (ink on the
            light bg, cream on dark) — the two-ink brand's mode choice, no recolor. */}
        <EraMark fill="var(--color-mark-onbg)" heightPx={22} />
        <HeroTitle />
        <Text
          variant="body"
          as="p"
          className="era-hero-line"
          style={{ ...subStyle, ['--hero-line-index' as string]: 2 }}
        >
          {strings.site.hero.sub}
        </Text>
        <div style={formWrapStyle}>
          <WaitlistForm variant="bar" />
        </div>
      </div>
    </section>
  );
}
