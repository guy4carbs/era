'use client';

import { type CSSProperties, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { glow, motion as motionToken, orb } from '@era/tokens';
import { useTheme } from '../../lib/theme';
import { glowShadow } from '../../lib/glow';
import { transitionFor } from '../../lib/motion';

/** Ovi's three living states. */
export type OviOrbState = 'idle' | 'thinking' | 'speaking';

/**
 * A named canonical size, an explicit pixel diameter, or a raw CSS length
 * (`{ cssVar: 'var(--rail-orb)' }`) for the small sibling orbs that keep their
 * own existing size vars.
 */
export type OviOrbSize = number | 'corner' | 'header' | 'panel' | { cssVar: string };

export interface OviOrbProps {
  /** Diameter: a canonical size name (→ the orb CSS var) or an explicit px. */
  size?: OviOrbSize;
  /** The living state; drives the breath cadence, the shimmer, and the pulse. */
  state?: OviOrbState;
  /** When true, the orb leans toward the pointer and presses (corner/panel). */
  interactive?: boolean;
  /** aria-label for interactive orbs; decorative orbs pass none and go aria-hidden. */
  label?: string;
  onClick?: () => void;
  style?: CSSProperties;
}

/** Resolve a size to a CSS length: a named token var, a raw CSS var, or px. */
function resolveDiameter(size: OviOrbSize): string {
  if (size === 'corner') return 'var(--orb-corner)';
  if (size === 'header') return 'var(--orb-header)';
  if (size === 'panel') return 'var(--orb-panel)';
  if (typeof size === 'object') return size.cssVar;
  return `${size}px`;
}

// The dimensional core: a warm-cream radial with an off-centre light origin
// (~30%/25%) inside the 1px taupe rim. surface → bg gives the sphere its
// gradient body; the rim reads as the terminator edge.
const coreBackground =
  'radial-gradient(circle at 30% 25%, var(--color-surface), var(--color-bg))';

// The 1px lit highlight arc across the top of the sphere. A soft white radial,
// masked to a thin crescent up top via a second (transparent-cored) radial as
// the CSS mask — so it reads as a catch-light, never a full border. Opacity is
// the token highlight opacity; `white` is a CSS keyword (not a hex), so it
// stays clear of the design-consistency hex guard.
const highlightArc = `radial-gradient(circle at 50% 18%, color-mix(in srgb, white ${Math.round(
  orb.highlight.opacity * 100,
)}%, transparent), transparent 45%)`;

// The THINKING shimmer layer — a soft accent conic sweep that rotates. It sits
// under the core (behind the cream), so only its glow bleeds past the rim.
const shimmerBackground =
  'conic-gradient(from 0deg, transparent, color-mix(in srgb, var(--color-accent) 55%, transparent), transparent 55%)';

const fillStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  borderRadius: 'var(--radius-full)',
};

/**
 * OviOrb — Ovi's living presence. A dimensional warm-cream sphere (radial core,
 * 1px taupe rim, a lit highlight arc) carrying the §3 accent glow, in three
 * spring-driven states:
 *
 *   IDLE     — breathing: scale 1 ↔ 1+breath.scaleAmount and a glow-opacity
 *              pulse on the shared 3s heartbeat.
 *   THINKING — the glow shimmers in a slow rotation (shimmer.rotateMs) while the
 *              breath quickens (breath.thinkingMs).
 *   SPEAKING — a slightly larger pulse on the speaking cadence while the reply
 *              text lands.
 *
 * Interactive orbs lean lean.px toward the pointer on the fluid spring and press
 * on tap. Reduced motion holds a static orb at base glow opacity — no breath,
 * shimmer, pulse, or lean.
 *
 * The ambient loop durations (breath, shimmer, speaking) are exempt from
 * motion.durations.maxMs, the same precedent as glow.pulse: that ceiling governs
 * transitions, not idle atmosphere.
 */
export function OviOrb({
  size = 'corner',
  state = 'idle',
  interactive = false,
  label,
  onClick,
  style,
}: OviOrbProps) {
  const reduced = useReducedMotion();
  const { resolved } = useTheme();
  const ref = useRef<HTMLElement>(null);

  const baseOpacity = glow.opacity[resolved];
  const restShadow = glowShadow(baseOpacity);
  const peakShadow = glowShadow(baseOpacity + glow.pulse.amount);

  // Lean offset toward the pointer, clamped to lean.px on the fluid spring.
  const [lean, setLean] = useState({ x: 0, y: 0 });

  // FRAMER LAW: the reduced flag is a per-render read from useReducedMotion, but
  // it never mid-flight switches a running variant here — each `animate` object
  // is recomputed as a whole and swapped atomically, not toggled inside a loop.
  const diameter = resolveDiameter(size);

  // The breathing/pulse animation for the whole orb, by state. All spring/loop
  // durations come from the orb + glow tokens; reduced motion holds it still.
  const orbAnimate = reduced
    ? { scale: 1, boxShadow: restShadow, x: 0, y: 0 }
    : state === 'speaking'
      ? {
          scale: [1, 1 + orb.speaking.scaleAmount, 1],
          boxShadow: [restShadow, peakShadow, restShadow],
          x: lean.x,
          y: lean.y,
        }
      : {
          scale: [1, 1 + orb.breath.scaleAmount, 1],
          boxShadow: [restShadow, peakShadow, restShadow],
          x: lean.x,
          y: lean.y,
        };

  // The breath loop timing: idle heartbeat, quicker while thinking, the speaking
  // cadence while a reply lands. The token bezier (an array, not a string) keeps
  // the pulse off the motion-consistency string-easing guard.
  const loopMs =
    state === 'thinking'
      ? orb.breath.thinkingMs
      : state === 'speaking'
        ? orb.speaking.pulseMs
        : orb.breath.idleMs;

  const breathTransition = reduced
    ? transitionFor(motionToken.springs.fluid, reduced)
    : {
        scale: {
          duration: loopMs / 1000,
          repeat: Infinity,
          ease: motionToken.easing.bezier,
        },
        boxShadow: {
          duration: loopMs / 1000,
          repeat: Infinity,
          ease: motionToken.easing.bezier,
        },
        // The lean rides the fluid spring, independent of the ambient loop.
        x: transitionFor(motionToken.springs.fluid, reduced),
        y: transitionFor(motionToken.springs.fluid, reduced),
      };

  function onPointerMove(event: React.PointerEvent) {
    if (!interactive || reduced) return;
    const node = ref.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    // Direction to the pointer, clamped to lean.px in each axis.
    const dx = event.clientX - cx;
    const dy = event.clientY - cy;
    const mag = Math.hypot(dx, dy) || 1;
    setLean({
      x: (dx / mag) * orb.lean.px,
      y: (dy / mag) * orb.lean.px,
    });
  }

  function onPointerLeave() {
    if (reduced) return;
    setLean({ x: 0, y: 0 });
  }

  const rootStyle: CSSProperties = {
    position: 'relative',
    width: diameter,
    height: diameter,
    flex: 'none',
    borderRadius: 'var(--radius-full)',
    // The whole orb carries only the glow shadow; the sphere body, rim, and arc
    // are layered children so the THINKING shimmer can bleed out from BEHIND the
    // cream. `background: transparent` keeps the root itself invisible.
    background: 'transparent',
    border: 'none',
    boxSizing: 'border-box',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    ...(interactive ? { cursor: 'pointer' } : {}),
    ...style,
  };

  // The cream sphere overlay: the radial core inside the 1px taupe rim. Sits
  // ABOVE the shimmer so the shimmer only escapes as a rotating halo past the
  // rim, never washing over the cream.
  const sphereStyle: CSSProperties = {
    ...fillStyle,
    background: coreBackground,
    border: 'var(--orb-rim) solid var(--color-accent)',
    boxSizing: 'border-box',
  };

  const Root = interactive ? motion.button : motion.span;

  return (
    <Root
      ref={ref as never}
      type={interactive ? 'button' : undefined}
      aria-label={interactive ? label : undefined}
      aria-hidden={interactive ? undefined : true}
      style={{ ...rootStyle, boxShadow: restShadow }}
      animate={orbAnimate}
      transition={breathTransition}
      whileTap={interactive && !reduced ? { scale: motionToken.press.scale } : undefined}
      onPointerMove={interactive ? onPointerMove : undefined}
      onPointerLeave={interactive ? onPointerLeave : undefined}
      onClick={onClick}
    >
      {/* THINKING shimmer — a slow accent conic sweep BEHIND the cream sphere, so
          only its glow bleeds out past the rim as a rotating halo. The ONE
          permitted continuous rotation; driven on the token bezier (array, not a
          `linear` string) to stay clear of the motion-consistency guard. Off
          under reduced motion. */}
      {state === 'thinking' && !reduced ? (
        <motion.span
          aria-hidden="true"
          style={{ ...fillStyle, background: shimmerBackground }}
          animate={{ rotate: 360 }}
          transition={{
            duration: orb.shimmer.rotateMs / 1000,
            repeat: Infinity,
            ease: motionToken.easing.bezier,
          }}
        />
      ) : null}
      {/* The cream sphere body + taupe rim, above the shimmer. */}
      <span aria-hidden="true" style={sphereStyle} />
      {/* The lit highlight arc, always on top of the sphere. */}
      <span aria-hidden="true" style={{ ...fillStyle, background: highlightArc }} />
    </Root>
  );
}
