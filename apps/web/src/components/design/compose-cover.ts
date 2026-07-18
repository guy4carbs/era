/**
 * Compose an outfit cover from the current stage into a PNG blob, entirely on an
 * offscreen <canvas>. Each piece is drawn at its normalized transform (posX/posY
 * center, scale as a fraction of stage width, rotation) in layerOrder, over the
 * resolved surface color. The result mirrors what the user arranged, at a fixed
 * export resolution, so the Design tab and era collages show a real thumbnail.
 *
 * Best-effort: a cross-origin image that taints the canvas, or any load/encoding
 * failure, resolves to null so the caller can save the outfit without a cover
 * (the list falls back to member thumbnails). Never throws.
 */
import { palette } from '@era/tokens';

import { EXPORT_WIDTH, STAGE_ASPECT, type PlacedItem } from './types';

/** Load one image with CORS enabled; resolve null if it never loads. */
function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** Read a resolved theme color (canvas needs a real value, not a CSS var). */
function surfaceColor(): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue('--color-surface').trim();
  return value.length > 0 ? value : palette.white;
}

/**
 * Render the placed pieces to a PNG blob, or null when nothing renders (no
 * images loaded, canvas tainted, or encoding failed). `placed` need not be
 * pre-sorted — this draws in ascending layerOrder.
 */
export async function composeCover(placed: PlacedItem[]): Promise<Blob | null> {
  const width = EXPORT_WIDTH;
  const height = Math.round(EXPORT_WIDTH / STAGE_ASPECT);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return null;
  }

  ctx.fillStyle = surfaceColor();
  ctx.fillRect(0, 0, width, height);

  const ordered = [...placed].sort((a, b) => a.layerOrder - b.layerOrder);
  let drewAny = false;

  for (const piece of ordered) {
    if (!piece.displayUrl) {
      continue;
    }
    const img = await loadImage(piece.displayUrl);
    if (!img || img.naturalWidth === 0) {
      continue;
    }
    // scale 1 == full stage width; height follows the image's aspect.
    const destWidth = piece.scale * width;
    const destHeight = destWidth * (img.naturalHeight / img.naturalWidth);

    ctx.save();
    ctx.translate(piece.posX * width, piece.posY * height);
    ctx.rotate((piece.rotation * Math.PI) / 180);
    ctx.drawImage(img, -destWidth / 2, -destHeight / 2, destWidth, destHeight);
    ctx.restore();
    drewAny = true;
  }

  if (!drewAny) {
    return null;
  }

  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob), 'image/png');
    } catch {
      // Tainted canvas (a cover image without CORS headers) — save coverless.
      resolve(null);
    }
  });
}
