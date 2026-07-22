'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { motion, useInView, useReducedMotion } from 'motion/react';
import { strings } from '@era/core/strings';
import { glow, motion as motionToken } from '@era/tokens';
import { GlassPanel } from '../index';
import { Text } from '../Text';
import { OviOrb, type OviOrbState } from '../ovi/OviOrb';

/**
 * Section 2's live embed: Ovi's presence, live. Her breathing orb sits beside one
 * of her honest lines — the literal `strings.ovi.gapHonest(...)` "tells you when
 * NOT to buy" voice — which streams in word by word once the section is a third
 * on screen, exactly the sanctioned design-lab cadence (`stream.wordMs`, the orb
 * holding SPEAKING for the reveal then settling to IDLE, a soft accent caret
 * blinking at the insertion point on `caretDimOpacity`).
 *
 * The reply's line height is reserved (min-height) so the streaming text never
 * grows the panel — the embed contributes no layout shift. Under reduced motion
 * the full line shows at once and the orb holds idle.
 */

// A representative thin category for the sample line — Ovi's honest gap voice,
// reused verbatim (no new copy).
const SAMPLE_CATEGORY = 'outerwear';
const OVI_LINE = strings.ovi.gapHonest(SAMPLE_CATEGORY);

/** Word+trailing-whitespace tokens — mirrors OviChat/the lab so spacing matches. */
function streamTokens(reply: string): string[] {
  return reply.match(/\S+\s*/g) ?? [];
}

const panelStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 'var(--space-4)',
  padding: 'var(--space-6)',
  maxWidth: 'var(--content-max)',
};

// Reserve the reply's vertical space so streaming can't reflow the panel.
const replyWrapStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
};

const replyStyle: CSSProperties = {
  margin: 0,
  maxWidth: '46ch',
  // Reserve two lines of body measure so the word stream never grows the box.
  minHeight: 'calc(2 * 1.5em)',
  color: 'var(--color-text)',
};

// The soft accent caret at the streaming insertion point (OviChat's cursorStyle).
const caretStyle: CSSProperties = {
  display: 'inline-block',
  width: 'var(--glass-border-width)',
  height: '1em',
  marginLeft: 'var(--space-1)',
  verticalAlign: 'text-bottom',
  borderRadius: 'var(--radius-chip)',
  background: 'var(--color-accent)',
};

export function OviShowcase() {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  // Fire the stream once the section is a third on screen (matches the
  // ScrollReveal amount for the sections).
  const inView = useInView(ref, { once: true, amount: 0.3 });

  const tokens = streamTokens(OVI_LINE);
  const [shown, setShown] = useState(0);
  const [orbState, setOrbState] = useState<OviOrbState>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (reduced) {
      setShown(tokens.length);
      setOrbState('idle');
      return;
    }
    if (!inView) return;
    setOrbState('speaking');
    const tick = (count: number) => {
      if (count >= tokens.length) {
        setOrbState('idle');
        return;
      }
      timer.current = setTimeout(() => {
        setShown(count + 1);
        tick(count + 1);
      }, motionToken.stream.wordMs);
    };
    setShown(1);
    tick(1);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // Runs when the section enters view (or immediately under reduced motion).
  }, [inView, reduced, tokens.length]);

  const isStreaming = !reduced && shown < tokens.length;
  const shownText = tokens.slice(0, shown).join('');

  return (
    <div ref={ref}>
      <GlassPanel style={panelStyle}>
        <OviOrb size="panel" state={orbState} />
        <div style={replyWrapStyle}>
          <Text variant="oviAccent" as="span" style={{ margin: 0 }}>
            Ovi
          </Text>
          <Text variant="body" as="p" size="title3" style={replyStyle}>
            {shownText}
            {isStreaming ? (
              <motion.span
                aria-hidden="true"
                style={caretStyle}
                animate={{ opacity: [1, glow.caretDimOpacity, 1] }}
                transition={{
                  duration: motionToken.stream.wordMs / 1000,
                  repeat: Infinity,
                  ease: motionToken.easing.bezier,
                }}
              />
            ) : null}
          </Text>
        </div>
      </GlassPanel>
    </div>
  );
}
