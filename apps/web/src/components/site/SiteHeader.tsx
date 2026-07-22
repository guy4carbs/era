'use client';

import { useRef, type CSSProperties } from 'react';
import { motion, useInView, useReducedMotion } from 'motion/react';
import { strings } from '@era/core/strings';
import { motion as motionToken } from '@era/tokens';
import { glassSurfaceStyle } from '../index';
import { Text } from '../Text';
import { EraMark } from '../EraMark';
import { transitionFor } from '../../lib/motion';

/**
 * The sticky glass site header for the landing. It stays hidden over the hero
 * and fades in once the hero has scrolled past — tracked by a zero-height
 * sentinel this component drops at the top of the page: while the sentinel is in
 * view (i.e. the hero fills the screen) the bar is hidden; once it leaves, the
 * bar appears. The bar is `position: fixed`, so it is out of flow and cannot
 * shift layout (CLS-exempt). Reduced motion swaps the fade for an instant show.
 *
 * Renders a wordmark and a single 'Join the waitlist' anchor to `#waitlist`
 * (native scroll, no JS) — the same target the hero and closer forms anchor.
 */

const barStyle: CSSProperties = {
  ...glassSurfaceStyle({ shadow: 'e3' }),
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  zIndex: 10,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--space-4)',
  minHeight: 'var(--header-height)',
  paddingInline: 'var(--space-6)',
  // Square the top corners against the viewport edge; keep the glass radius only
  // where it reads (there is none visible at the flush top, so a plain bar).
  borderRadius: 0,
  borderInline: 'none',
  borderTop: 'none',
};

// The header CTA — a compact accent pill anchor mirroring the primary button
// surface, native-scrolling to the waitlist. Type/label via <Text variant="ui">.
const ctaStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 'var(--touch-target-min)',
  paddingInline: 'var(--space-4)',
  borderRadius: 'var(--radius-input)',
  background: 'var(--color-accent)',
  color: 'var(--color-ink)',
  textDecoration: 'none',
  boxShadow: 'var(--shadow-e1)',
};

export function SiteHeader() {
  const reduced = useReducedMotion();
  const sentinelRef = useRef<HTMLDivElement>(null);
  // The sentinel sits at the very top; once it leaves the viewport the hero has
  // scrolled past and the header should be showing. `once: false` so the header
  // hides again if the user scrolls back to the hero.
  const heroInView = useInView(sentinelRef, { amount: 'some' });
  const shown = !heroInView;

  return (
    <>
      {/* Zero-height boundary marker at the top of the page flow. */}
      <div ref={sentinelRef} aria-hidden="true" style={{ height: 0 }} />
      <motion.header
        style={barStyle}
        initial={false}
        animate={reduced ? { opacity: shown ? 1 : 0 } : { opacity: shown ? 1 : 0, y: shown ? 0 : -motionToken.stagger.riseYPx }}
        transition={transitionFor(motionToken.springs.gentle, reduced)}
        // Keep the hidden bar out of the tab order and off assistive tech.
        {...(shown ? {} : { inert: '' as unknown as boolean, 'aria-hidden': true })}
      >
        {/* The locked mark at the header's small register. The per-mode ink comes
            from --color-mark-onbg (ink on light, cream on dark) — no recolor. 16px
            is the sanctioned inline minimum. */}
        <EraMark fill="var(--color-mark-onbg)" heightPx={16} />
        <a href="#waitlist" style={ctaStyle}>
          <Text variant="ui" as="span" style={{ color: 'inherit' }}>
            {strings.site.hero.cta}
          </Text>
        </a>
      </motion.header>
    </>
  );
}
