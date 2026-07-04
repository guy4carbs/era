/**
 * Snapping math for the canvas: as a piece's center drags near the stage center
 * or another piece's center, its center eases onto that line and a faint guide
 * is drawn. Pure geometry over normalized coordinates — no design tokens, no
 * DOM. The threshold is a normalized distance (DATA), applied per-axis so the
 * pull feels even on a non-square stage.
 */
import { CENTER } from './types';

/** A guide line to draw across the stage, at a normalized position. */
export interface Guide {
  axis: 'x' | 'y';
  /** Normalized position (0..1) on its axis. */
  at: number;
}

/** The snapped center (in px) plus any guides that fired. */
export interface SnapResult {
  x: number;
  y: number;
  guides: Guide[];
}

/** Nearest target within threshold, or null. Targets + value are in px. */
function nearest(valuePx: number, targetsNorm: number[], sizePx: number, thresholdPx: number): number | null {
  let bestNorm: number | null = null;
  let bestDist = thresholdPx;
  for (const t of targetsNorm) {
    const dist = Math.abs(valuePx - t * sizePx);
    if (dist <= bestDist) {
      bestDist = dist;
      bestNorm = t;
    }
  }
  return bestNorm;
}

/**
 * Snap a dragged center (cxPx, cyPx) to the stage center and to any other
 * piece's center, within `thresholdNorm` (normalized) on each axis. Returns the
 * corrected px center and the guides to render. `others` are the OTHER pieces'
 * normalized centers (exclude the one being dragged).
 */
export function applySnap(
  cxPx: number,
  cyPx: number,
  width: number,
  height: number,
  others: { posX: number; posY: number }[],
  thresholdNorm: number,
): SnapResult {
  const guides: Guide[] = [];
  const xTargets = [CENTER, ...others.map((o) => o.posX)];
  const yTargets = [CENTER, ...others.map((o) => o.posY)];

  let x = cxPx;
  const snapX = nearest(cxPx, xTargets, width, thresholdNorm * width);
  if (snapX !== null) {
    x = snapX * width;
    guides.push({ axis: 'x', at: snapX });
  }

  let y = cyPx;
  const snapY = nearest(cyPx, yTargets, height, thresholdNorm * height);
  if (snapY !== null) {
    y = snapY * height;
    guides.push({ axis: 'y', at: snapY });
  }

  return { x, y, guides };
}
