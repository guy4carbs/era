'use client';

/**
 * AngleViewer — the swipe/click-through multi-angle "dimensional" view of a piece.
 *
 * Replaces the static cutout on the item detail WHEN turnaround renders exist. The
 * pages read as a rotation: the straight-on cutout first, then the accepted
 * three-quarter / side / back renders in the frozen {@link TURNAROUND_ANGLES}
 * order (missing angles skipped) — composed by the pure `composeAnglePages`.
 *
 * Interaction: a framer-motion `drag="x"` track that snaps to the nearest page on
 * release (distance OR fling velocity), plus real arrow buttons and ArrowLeft/Right
 * keys. During a drag each image drifts a touch OPPOSITE the swipe for a subtle
 * dimensional read; quiet page dots track position. The whole viewer is a labelled
 * `group` with a polite aria-live region announcing the current view via
 * `strings.turnaround.angleLabel` ("Front view" for the cutout). Under reduced
 * motion the parallax is dropped and page changes are instant. Tokens only.
 */
import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type MotionValue,
  type PanInfo,
} from 'framer-motion';
import { motion as motionToken, layout, spacing, typeRamp } from '@era/tokens';
import { strings } from '@era/core/strings';
import { type TurnaroundRender } from '@era/core/turnaround';
import { springTransition } from '../../lib/motion';
import { composeAnglePages, type AngleViewerPage } from '../../lib/turnaround-pages';

export interface AngleViewerProps {
  /** The straight-on cutout URL — the first page (the existing detail image). */
  frontUrl: string;
  /** The accepted turnaround renders; ordered + missing-angle-skipped internally. */
  renders: readonly TurnaroundRender[];
  /** Alt text for the front cutout page (the item's name). */
  frontAlt: string;
  /** Tag-composed descriptor for the angle pages, e.g. "Black wool coat" (SEO alt base). */
  altBase: string;
}

/** How far (px) the image drifts against the swipe — the parallax depth cue. */
const PARALLAX = spacing.s4;
/** Fraction of a full page's drag distance that a snap commits on. */
const SNAP_FRACTION = 0.25;
/** A fling faster than this (px/s) flips the page regardless of distance. */
const SNAP_VELOCITY = 500;

/** The plain name for a page — "Front view" for the cutout, else the angle. */
function pageLabel(page: AngleViewerPage): string {
  return page.angle === 'front' ? 'Front view' : strings.turnaround.angleLabel(page.angle);
}

/** Alt text for a page: the item name on the cutout, else "<descriptor>, <view>". */
function pageAlt(page: AngleViewerPage, frontAlt: string, altBase: string): string {
  if (page.angle === 'front') return frontAlt;
  return altBase ? `${altBase}, ${pageLabel(page)}` : pageLabel(page);
}

export function AngleViewer({ frontUrl, renders, frontAlt, altBase }: AngleViewerProps) {
  const reduced = useReducedMotion();
  const viewportRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const x = useMotionValue(0);

  const pages = composeAnglePages(frontUrl, renders);
  const lastIndex = Math.max(0, pages.length - 1);

  // Measure the viewport so drag constraints + the per-page rest positions are in
  // real pixels (percentage drag can't parallax cleanly).
  useEffect(() => {
    const node = viewportRef.current;
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width ?? 0;
      setWidth(next);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Keep the track anchored to the current page whenever the width or index
  // changes from outside a drag (resize, programmatic move).
  useEffect(() => {
    x.set(-index * width);
  }, [index, width, x]);

  const goTo = useCallback(
    (target: number) => {
      const clamped = Math.min(lastIndex, Math.max(0, target));
      setIndex(clamped);
      const to = -clamped * width;
      if (reduced || width === 0) {
        x.set(to);
      } else {
        void animate(x, to, springTransition(motionToken.springs.gentle));
      }
    },
    [lastIndex, width, reduced, x],
  );

  const handleDragEnd = useCallback(
    (_event: unknown, info: PanInfo) => {
      const offset = info.offset.x;
      const velocity = info.velocity.x;
      const threshold = width * SNAP_FRACTION;
      let next = index;
      if (offset < -threshold || velocity < -SNAP_VELOCITY) next = index + 1;
      else if (offset > threshold || velocity > SNAP_VELOCITY) next = index - 1;
      goTo(next);
    },
    [width, index, goTo],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        goTo(index + 1);
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        goTo(index - 1);
      }
    },
    [goTo, index],
  );

  const current = pages[index] ?? pages[0];
  const multi = pages.length > 1;

  return (
    <div style={rootStyle}>
      <div
        ref={viewportRef}
        role="group"
        aria-roledescription="carousel"
        aria-label={strings.turnaround.viewAngles}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        style={viewportStyle}
      >
        <motion.div
          style={{ ...trackStyle, x }}
          drag={multi ? 'x' : false}
          dragConstraints={{ left: -lastIndex * width, right: 0 }}
          dragElastic={0.12}
          onDragEnd={handleDragEnd}
        >
          {pages.map((page, pageIndex) => (
            <AnglePage
              key={page.key}
              page={page}
              pageIndex={pageIndex}
              width={width}
              x={x}
              parallax={reduced ? 0 : PARALLAX}
              alt={pageAlt(page, frontAlt, altBase)}
            />
          ))}
        </motion.div>

        {multi ? (
          <>
            <ArrowButton
              direction="prev"
              disabled={index === 0}
              onClick={() => goTo(index - 1)}
            />
            <ArrowButton
              direction="next"
              disabled={index === lastIndex}
              onClick={() => goTo(index + 1)}
            />
          </>
        ) : null}

        {/* Polite live region: announces the settled view to screen readers. */}
        <span aria-live="polite" style={srOnlyStyle}>
          {current ? pageLabel(current) : 'Front view'}
        </span>
      </div>

      {multi ? (
        <div style={dotsStyle} aria-hidden="true">
          {pages.map((page, dotIndex) => (
            <span
              key={page.key}
              style={{
                ...dotStyle,
                background: dotIndex === index ? 'var(--color-accent)' : 'var(--color-hairline)',
              }}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

interface AnglePageProps {
  page: AngleViewerPage;
  pageIndex: number;
  width: number;
  x: MotionValue<number>;
  /** Parallax drift in px; 0 flattens it (reduced motion). */
  parallax: number;
  alt: string;
}

function AnglePage({ page, pageIndex, width, x, parallax, alt }: AnglePageProps) {
  // Drift opposite the track: at rest (x === -pageIndex*width) the offset is 0;
  // as the track drags the image leans the other way, clamped to ±parallax.
  const parallaxX = useTransform(x, (value) => {
    if (parallax === 0 || width === 0) return 0;
    const offset = value + pageIndex * width;
    const drift = -(offset / width) * parallax;
    return Math.max(-parallax, Math.min(parallax, drift));
  });

  return (
    <div style={pageStyle}>
      <motion.div style={{ ...pageInnerStyle, x: parallaxX }}>
        <img src={page.displayUrl} alt={alt} draggable={false} style={imageStyle} />
      </motion.div>
    </div>
  );
}

function ArrowButton({
  direction,
  disabled,
  onClick,
}: {
  direction: 'prev' | 'next';
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={direction === 'prev' ? 'Previous view' : 'Next view'}
      disabled={disabled}
      onClick={onClick}
      style={{
        ...arrowStyle,
        [direction === 'prev' ? 'left' : 'right']: 'var(--space-2)',
        opacity: disabled ? 0 : 1,
        pointerEvents: disabled ? 'none' : 'auto',
      }}
    >
      <span aria-hidden="true">{direction === 'prev' ? '‹' : '›'}</span>
    </button>
  );
}

const rootStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
};

const viewportStyle: CSSProperties = {
  position: 'relative',
  overflow: 'hidden',
  aspectRatio: layout.itemCard.aspectRatio,
  background: 'var(--color-surface)',
  borderRadius: 'var(--radius-card)',
  border: 'var(--glass-border-width) solid var(--color-hairline)',
  touchAction: 'pan-y',
};

const trackStyle: CSSProperties = {
  display: 'flex',
  height: '100%',
  cursor: 'grab',
};

const pageStyle: CSSProperties = {
  flex: '0 0 100%',
  width: '100%',
  height: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 'var(--space-6)',
  boxSizing: 'border-box',
};

const pageInnerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '100%',
  height: '100%',
};

const imageStyle: CSSProperties = {
  maxWidth: '100%',
  maxHeight: '100%',
  objectFit: 'contain',
  userSelect: 'none',
  pointerEvents: 'none',
};

const arrowStyle: CSSProperties = {
  position: 'absolute',
  top: '50%',
  transform: 'translateY(-50%)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 'var(--touch-target-min)',
  height: 'var(--touch-target-min)',
  border: 'var(--glass-border-width) solid var(--color-hairline)',
  borderRadius: '50%',
  background: 'color-mix(in srgb, var(--color-surface) 82%, transparent)',
  color: 'var(--color-text)',
  fontSize: typeRamp.title3.rem,
  lineHeight: 1,
  cursor: 'pointer',
  zIndex: 2,
  transition: 'opacity 150ms ease',
};

const dotsStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
  gap: 'var(--space-2)',
};

const dotStyle: CSSProperties = {
  width: 'var(--space-2)',
  height: 'var(--space-2)',
  borderRadius: '50%',
};

// Screen-reader-only live region — off-canvas, no layout impact.
const srOnlyStyle: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
};
