'use client';

import {
  useState,
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { motion, useReducedMotion, useSpring, useTransform } from 'motion/react';
import { motion as motionToken, glow, layout, spacing } from '@era/tokens';
import { useTheme } from '../../lib/theme';
import { transitionFor } from '../../lib/motion';

/** How the surface responds to a pointer. */
export type ItemSurfaceInteraction = 'full' | 'press' | 'none';

/** A statically-rendered visual state — Design-Lab specimen matrix only. */
export type ItemSurfaceForcedState = 'rest' | 'lift' | 'tilt' | 'selected';

export interface ItemSurfaceProps {
  /** Cutout URL; when null the reserved box renders empty (no CLS on load). */
  src: string | null;
  /** Alt text for the cutout image. */
  alt: string;
  /** Persistent full-strength glow + deepened shadow (e.g. a chosen piece). */
  selected?: boolean;
  /**
   * Pointer behaviour: `full` = tilt + parallax + lift + sheen slide (the hero);
   * `press` = lift + shadow/glow on hover/press, no tilt (small collage tiles);
   * `none` = inert surface (decorative / disabled).
   */
  interactive?: ItemSurfaceInteraction;
  /** Fired on click/press when the surface is interactive. */
  onPress?: () => void;
  /** Absolutely-positioned overlay slot (e.g. the unconfirmed draft dot). */
  badge?: ReactNode;
  /**
   * Statically render a visual state with NO listeners — the Design-Lab matrix
   * driver. Overrides `interactive` (the specimen is a still frame).
   */
  forcedState?: ItemSurfaceForcedState;
  /** Extra styles merged onto the outer (button/div) element. */
  style?: CSSProperties;
  /** Extra styles merged onto the cutout `<img>`. */
  imgStyle?: CSSProperties;
}

// Perspective distance for the tilt, derived from spacing tokens (s16 × 12 =
// 768) — a mid-depth 3D field where a 7° rotation reads as a gentle lean, not a
// fold. A unitless multiple of a token, never a raw px literal.
const PERSPECTIVE = spacing.s16 * 12;

// Sheen overlay bleeds past the frame by space-4 so the highlight can slide
// (up to ~1.5× parallaxPx) without exposing an edge; overflow on the card clips
// the excess back to the corners.
const SHEEN_BLEED = spacing.s4;
const SHEEN_SHIFT = 1.5;

// The representative frozen tilt for the Design-Lab `tilt` specimen: a fixed
// lean well within `motion.tilt.maxDeg` (7°) so the still frame reads as a live
// tilt without pinning to the extreme. Parallax offset is a fraction of the
// token `parallaxPx`, matching the direction of the rotation.
const FORCED_TILT = { rotateX: -4, rotateY: 5 } as const;
const FORCED_PARALLAX = { x: motionToken.tilt.parallaxPx * 0.5, y: -motionToken.tilt.parallaxPx * 0.5 } as const;

/**
 * The Item Engine — Era's signature hero object. One garment cutout on a 4:5
 * cream card with a hairline frame, dual-shadow depth, a 135° specular sheen,
 * and a 1% warm-tone wash that harmonizes mixed-source photos into one
 * collection.
 *
 * On a pointer device it comes alive per `interactive`:
 *  - `full` — moving over the card tilts it up to `motion.tilt.maxDeg` (7°) on
 *    both axes, floats the cutout by `parallaxPx` (6px) against that tilt for
 *    depth, and slides the sheen across the surface. Hover/press RAISES the card
 *    (`--item-lift` / `--item-lift-scale`) — the deliberate divergence from the
 *    universal 0.97 press-compress: the item is the product, so it rises —
 *    deepening its shadow e3→e4 and adding an accent glow at
 *    `glow.opacity × hover.glowIntensity`.
 *  - `press` — the same lift + shadow + glow on hover/press, but NO tilt/parallax
 *    (restraint on small collage tiles).
 *  - `none` — inert.
 *
 * `selected` holds a steady FULL-strength glow (`glow.opacity × 1.0`, no hover
 * multiplier) and the e4 shadow — persistent, no pulse (pulse is Ovi's gesture).
 *
 * `forcedState` statically renders one visual state (lift / tilt / selected)
 * with no listeners — the Design-Lab specimen driver. Every value traces to
 * `@era/tokens`; the lift comes only from the `--item-lift*` vars, never a
 * literal.
 *
 * Under `prefers-reduced-motion` the tilt/parallax/sheen-slide are off and every
 * transition collapses via `transitionFor`; the resting sheen still renders (a
 * still specular cue, not motion).
 */
export function ItemSurface({
  src,
  alt,
  selected = false,
  interactive = 'full',
  onPress,
  badge,
  forcedState,
  style,
  imgStyle,
}: ItemSurfaceProps) {
  const reduced = useReducedMotion();
  const { resolved } = useTheme();
  const [hovered, setHovered] = useState(false);

  const spring = motionToken.springs.fluid;
  // Card rotation (deg) and cutout parallax (px), spring-eased so they track the
  // pointer with low friction and settle back to rest on leave.
  const rotateX = useSpring(0, spring);
  const rotateY = useSpring(0, spring);
  const parallaxX = useSpring(0, spring);
  const parallaxY = useSpring(0, spring);

  // Sheen slides opposite the cutout for a convincing moving highlight.
  const sheenX = useTransform(parallaxX, (v) => -v * SHEEN_SHIFT);
  const sheenY = useTransform(parallaxY, (v) => -v * SHEEN_SHIFT);

  const forced = forcedState !== undefined;
  const canTilt = !reduced && !forced && interactive === 'full';
  // Both `full` and `press` get the lift/shadow/glow on hover; only `none` opts out.
  const canLift = !forced && interactive !== 'none';

  function handleMove(event: PointerEvent<HTMLElement>) {
    if (!canTilt) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const nx = (event.clientX - rect.left) / rect.width - 0.5; // -0.5..0.5
    const ny = (event.clientY - rect.top) / rect.height - 0.5;
    rotateY.set(nx * 2 * motionToken.tilt.maxDeg);
    rotateX.set(-ny * 2 * motionToken.tilt.maxDeg);
    parallaxX.set(nx * 2 * motionToken.tilt.parallaxPx);
    parallaxY.set(ny * 2 * motionToken.tilt.parallaxPx);
  }

  function handleEnter() {
    if (!canLift) return;
    setHovered(true);
  }

  function handleLeave() {
    setHovered(false);
    rotateX.set(0);
    rotateY.set(0);
    parallaxX.set(0);
    parallaxY.set(0);
  }

  // Glow recipes. Hover = deeper ambient (e4) + accent glow at the per-mode glow
  // opacity scaled by the hover intensity — the same recipe as the Button.
  // Selected = the e4 shadow + accent glow at FULL strength (no hover multiplier).
  const hoverGlowPercent = Math.round(glow.opacity[resolved] * layout.hover.glowIntensity * 100);
  const hoverShadow = `var(--shadow-e4), 0 0 var(--glow-blur) color-mix(in srgb, var(--color-accent) ${hoverGlowPercent}%, transparent)`;
  const selectedGlowPercent = Math.round(glow.opacity[resolved] * 100);
  const selectedShadow = `var(--shadow-e4), 0 0 var(--glow-blur) color-mix(in srgb, var(--color-accent) ${selectedGlowPercent}%, transparent)`;

  // Resolve which visual state the card renders. `forcedState` wins (a still
  // specimen); otherwise the live hover/selected state drives it.
  const showLift = forcedState === 'lift' || (canLift && hovered);
  const showTilt = forcedState === 'tilt';
  const showSelected = forcedState === 'selected' || (!forced && selected);

  // The card's box-shadow: selected (or a lifted card) reads at e4 + glow; a
  // resting card sits on its e3 "item" shadow.
  const boxShadow = showSelected
    ? selectedShadow
    : showLift
      ? hoverShadow
      : 'var(--shadow-e3)';

  // Lift transform: RISES via the tokens only (translateY --item-lift + scale
  // --item-lift-scale). A lifted OR selected card floats forward.
  const liftTransform =
    showLift || showSelected
      ? 'translateY(var(--item-lift)) scale(var(--item-lift-scale))'
      : undefined;

  // Motion values for the live tilt (full/interactive), or the frozen tilt for
  // the `tilt` specimen. Forced states apply static offsets so the specimen is a
  // representative still frame with no listeners.
  const cardMotion = showTilt
    ? { rotateX: FORCED_TILT.rotateX, rotateY: FORCED_TILT.rotateY }
    : forced
      ? {}
      : { rotateX, rotateY };
  const frameMotion = showTilt
    ? { x: FORCED_PARALLAX.x, y: FORCED_PARALLAX.y }
    : forced
      ? {}
      : { x: parallaxX, y: parallaxY };
  const sheenMotion = showTilt
    ? { x: -FORCED_PARALLAX.x * SHEEN_SHIFT, y: -FORCED_PARALLAX.y * SHEEN_SHIFT }
    : canTilt
      ? { x: sheenX, y: sheenY }
      : {};

  const card = (
    <motion.div
      style={{
        ...cardStyle,
        transformPerspective: PERSPECTIVE,
        ...(liftTransform ? { transform: liftTransform } : {}),
        ...cardMotion,
      }}
      animate={{ boxShadow }}
      transition={transitionFor(motionToken.springs.gentle, reduced)}
    >
      <motion.div style={{ ...frameStyle, ...frameMotion }}>
        {src ? <img src={src} alt={alt} style={{ ...imageStyle, ...imgStyle }} /> : null}
      </motion.div>
      <span aria-hidden="true" style={warmToneStyle} />
      <motion.span aria-hidden="true" style={{ ...sheenStyle, ...sheenMotion }} />
      {badge}
    </motion.div>
  );

  // Inert render — no button, no listeners (forced specimens + `none`).
  if (forced || interactive === 'none' || onPress === undefined) {
    return <div style={{ ...outerStyle, ...style }}>{card}</div>;
  }

  return (
    <motion.button
      type="button"
      aria-label={alt}
      // Selection must reach assistive tech, not just the glow (parity with
      // mobile's accessibilityState.selected).
      aria-pressed={selected ? true : undefined}
      style={{ ...outerButtonStyle, ...style }}
      onPointerMove={handleMove}
      onPointerEnter={handleEnter}
      onPointerLeave={handleLeave}
      onClick={onPress}
      transition={transitionFor(motionToken.springs.snappy, reduced)}
    >
      {card}
    </motion.button>
  );
}

// Outer wrapper for the inert (div) render — a plain relative box.
const outerStyle: CSSProperties = {
  position: 'relative',
  width: '100%',
};

// Outer wrapper for the interactive (button) render — resets button chrome so
// only the card shows; the whole surface is one tap target.
const outerButtonStyle: CSSProperties = {
  position: 'relative',
  display: 'block',
  width: '100%',
  padding: 0,
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  textAlign: 'left',
};

const cardStyle: CSSProperties = {
  position: 'relative',
  aspectRatio: layout.itemCard.aspectRatio,
  padding: 'var(--item-card-padding)',
  background: 'var(--color-surface)',
  border: '1px solid var(--color-hairline)',
  borderRadius: 'var(--radius-card)',
  boxShadow: 'var(--shadow-e3)',
  overflow: 'hidden',
  isolation: 'isolate',
  willChange: 'transform',
};

const frameStyle: CSSProperties = {
  position: 'relative',
  height: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1,
};

// The cutout fills its (aspect-reserved) frame and never drives layout: explicit
// 100% box + object-fit contain, so image load can't reflow the tile (D6 CLS).
const imageStyle: CSSProperties = {
  width: '100%',
  height: '100%',
  objectFit: 'contain',
  display: 'block',
};

// Warm-tone wash — a 1% accent-hued overlay over the image area so mixed-source
// photos harmonize on the cream surface. Above the cutout, below the sheen.
const warmToneStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
  background: 'var(--color-accent)',
  opacity: 'var(--item-warm-tone)',
  zIndex: 2,
};

// 135° specular wash (sheen tokens), inset negative so it can slide with the
// tilt; sits above the cutout + warm tone, ignores pointer events.
const sheenStyle: CSSProperties = {
  position: 'absolute',
  inset: `calc(-1 * ${SHEEN_BLEED}px)`,
  pointerEvents: 'none',
  background: 'var(--sheen-gradient)',
  zIndex: 3,
};
