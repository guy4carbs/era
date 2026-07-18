import { type CSSProperties } from 'react';
import { strings } from '@era/core/strings';
import { typeRamp, boxShadows, sheen } from '@era/tokens';
import { Text, TextControlBoundary } from '../Text';
import { HeroGlow } from './HeroGlow';

/**
 * Full-bleed landing hero: the promise in an editorial serif over a soft accent
 * bloom, with a single CTA that scrolls to the waitlist form. This is a Server
 * Component — only the glow bloom ({@link HeroGlow}) is a client island, so the
 * critical render stays lean. The CTA is a plain anchor (no JS) to `#waitlist`;
 * smooth-scroll is honoured (and disabled under reduced motion) by the global
 * `scroll-behavior` rule.
 */

// Display headline: fluid between the title1 and display steps, with the
// display step's own line-height ratio (derived, so no literal is introduced).
const displayLineHeight = typeRamp.display.lineHeight / typeRamp.display.px;
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

const wordmarkStyle: CSSProperties = {
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--color-secondary-strong)',
};

// Display headline: the `display` role's fluid clamp handles size (opsz 144);
// only the bespoke bits — margin reset, color, and the measure — live here.
const titleStyle: CSSProperties = {
  margin: 0,
  lineHeight: displayLineHeight,
  color: 'var(--color-text)',
  maxWidth: '14ch',
};

const subStyle: CSSProperties = {
  margin: 0,
  fontSize: `clamp(${typeRamp.body.rem}, 2.5vw, ${typeRamp.title3.rem})`,
  lineHeight: subLineHeight,
  color: 'var(--color-secondary-strong)',
  maxWidth: '46ch',
};

// Primary CTA styled as an anchor (native scroll, no JS) — mirrors the Button
// primary surface: accent fill, ink label, e1 lift, and the sanctioned sheen.
const ctaStyle: CSSProperties = {
  position: 'relative',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  overflow: 'hidden',
  isolation: 'isolate',
  minHeight: 'var(--touch-target-web)',
  marginTop: 'var(--space-2)',
  paddingInline: 'var(--space-6)',
  borderRadius: 'var(--radius-input)',
  background: 'var(--color-accent)',
  color: 'var(--color-ink)',
  fontSize: typeRamp.subhead.rem,
  lineHeight: `${typeRamp.subhead.lineHeight}px`,
  fontWeight: 600,
  textDecoration: 'none',
  boxShadow: boxShadows.e1,
};

const ctaSheenStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
  zIndex: 1,
  background: `linear-gradient(${sheen.angleDeg}deg, ${sheen.from}, ${sheen.to})`,
};

export function Hero() {
  return (
    <section style={sectionStyle}>
      <HeroGlow />
      <div style={innerStyle}>
        <Text variant="title" as="span" size="title3" style={wordmarkStyle}>
          Era
        </Text>
        <Text variant="display" as="h1" style={titleStyle}>
          {strings.site.hero.title}
        </Text>
        <Text variant="body" as="p" style={subStyle}>
          {strings.site.hero.sub}
        </Text>
        <a href="#waitlist" style={ctaStyle}>
          <span aria-hidden="true" style={ctaSheenStyle} />
          <TextControlBoundary>
            <Text variant="ui" as="span" style={{ position: 'relative', zIndex: 2 }}>
              {strings.site.hero.cta}
            </Text>
          </TextControlBoundary>
        </a>
      </div>
    </section>
  );
}
