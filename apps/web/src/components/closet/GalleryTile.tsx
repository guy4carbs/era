'use client';

import { useState, type CSSProperties, type PointerEvent } from 'react';
import { motion, useReducedMotion, useSpring, useTransform } from 'framer-motion';
import {
  motion as motionToken,
  glow,
  layout,
  spacing,
} from '@era/tokens';
import { useTheme } from '../../lib/theme';
import { transitionFor } from '../../lib/motion';
import { Text } from '../Text';
import type { GalleryItem } from './types';

export interface GalleryTileProps {
  item: GalleryItem;
  /** Open the detail sheet for this piece. */
  onOpen: () => void;
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

/**
 * One garment as a 2.5D cutout tile — the premium gallery unit.
 *
 * The whole surface is a single tap target that opens the detail sheet. On a
 * pointer device it comes alive: moving over the tile tilts the card up to
 * `motion.tilt.maxDeg` (7°) on both axes, floats the cutout by `parallaxPx`
 * (6px) against that tilt for depth, and slides a 135° specular sheen across the
 * surface. Hovering lifts the card (`layout.hover.liftPx`), deepens its e3
 * "item" shadow toward e4, and adds an accent glow at `hover.glowIntensity`
 * (per-mode `glow.opacity`). Every value traces to `@era/tokens`.
 *
 * Under `prefers-reduced-motion` the tile is fully static: no tilt, no parallax,
 * no sheen slide, no lift/glow — just the resting cutout on its e3 card. The
 * sheen gradient still renders (a still specular cue, not motion).
 */
export function GalleryTile({ item, onOpen }: GalleryTileProps) {
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
  const lift = useSpring(0, spring);

  // Sheen slides opposite the cutout for a convincing moving highlight.
  const sheenX = useTransform(parallaxX, (v) => -v * SHEEN_SHIFT);
  const sheenY = useTransform(parallaxY, (v) => -v * SHEEN_SHIFT);

  const canTilt = !reduced;

  function handleMove(event: PointerEvent<HTMLButtonElement>) {
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
    if (!canTilt) return;
    setHovered(true);
    lift.set(layout.hover.liftPx);
  }

  function handleLeave() {
    setHovered(false);
    rotateX.set(0);
    rotateY.set(0);
    parallaxX.set(0);
    parallaxY.set(0);
    lift.set(0);
  }

  // Hover shadow = a deeper ambient (e4) plus an accent glow at the per-mode
  // glow opacity scaled by the hover intensity — same recipe as the Button.
  const glowPercent = Math.round(glow.opacity[resolved] * layout.hover.glowIntensity * 100);
  const hoverShadow = `var(--shadow-e4), 0 0 var(--glow-blur) color-mix(in srgb, var(--color-accent) ${glowPercent}%, transparent)`;

  const unconfirmed = !item.tagsConfirmed;
  const label = unconfirmed ? `${item.name} — tap to confirm` : item.name;

  return (
    <motion.button
      type="button"
      aria-label={label}
      style={buttonStyle}
      onPointerMove={handleMove}
      onPointerEnter={handleEnter}
      onPointerLeave={handleLeave}
      onClick={onOpen}
    >
      <motion.div
        style={{
          ...cardStyle,
          transformPerspective: PERSPECTIVE,
          rotateX,
          rotateY,
          y: lift,
        }}
        animate={{ boxShadow: canTilt && hovered ? hoverShadow : 'var(--shadow-e3)' }}
        transition={transitionFor(motionToken.springs.gentle, reduced)}
      >
        <motion.div style={{ ...frameStyle, x: parallaxX, y: parallaxY }}>
          {item.displayUrl ? <img src={item.displayUrl} alt="" style={imageStyle} /> : null}
        </motion.div>
        <motion.span
          aria-hidden="true"
          style={canTilt ? { ...sheenStyle, x: sheenX, y: sheenY } : sheenStyle}
        />
        {unconfirmed ? <span style={dotStyle} aria-hidden="true" /> : null}
      </motion.div>
      <Text
        variant="caption"
        size="footnote"
        as="p"
        style={{ margin: 0, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
      >
        {item.name}
      </Text>
    </motion.button>
  );
}

const buttonStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
  padding: 0,
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  textAlign: 'left',
  width: '100%',
};

const cardStyle: CSSProperties = {
  position: 'relative',
  aspectRatio: layout.itemCard.aspectRatio,
  padding: 'var(--item-card-padding)',
  background: 'var(--color-surface)',
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

const imageStyle: CSSProperties = {
  maxWidth: '100%',
  maxHeight: '100%',
  objectFit: 'contain',
};

// 135° specular wash (sheen tokens), inset negative so it can slide with the
// tilt; sits above the cutout, ignores pointer events.
const sheenStyle: CSSProperties = {
  position: 'absolute',
  inset: `calc(-1 * ${SHEEN_BLEED}px)`,
  pointerEvents: 'none',
  background: 'var(--sheen-gradient)',
  zIndex: 2,
};

// Accent dot marking an unconfirmed item ("tap to confirm").
const dotStyle: CSSProperties = {
  position: 'absolute',
  top: 'var(--item-card-padding)',
  right: 'var(--item-card-padding)',
  width: 'var(--space-2)',
  height: 'var(--space-2)',
  borderRadius: '50%',
  background: 'var(--color-accent)',
  zIndex: 3,
};

