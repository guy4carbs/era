/**
 * The Today reveal → Stories export (D9, web).
 *
 * Composes a 1080×1920 share PNG entirely on an offscreen `<canvas>`: the cream
 * canvas, 'Today' + Ovi's italic line in Fraunces, the outfit's cutouts drawn in
 * the same layered stack the reveal assembles, and the ERA / era.style watermark
 * (matching the mobile ShareFrame treatment: wordmark at 45% opacity, domain at
 * 70%). Downloads via `toBlob` → object URL → a synthetic `<a download>`.
 *
 * WHY THE LITERAL COLOURS: a canvas 2D context cannot read CSS custom
 * properties (`getComputedStyle` on canvas returns nothing useful for fills), so
 * the palette is imported directly from `@era/tokens` and drawn as literal hex —
 * the same sanctioned pattern the transactional email templates use. This file
 * is allowlisted in design-consistency.test.ts for exactly that reason.
 *
 * Honest degradation, never a throw at the user:
 *   - Fonts unavailable  → draw with the serif/sans fallback stacks.
 *   - Canvas tainted (a cutout image fails CORS) → produce the card MINUS the
 *     cutouts (text + watermark only), rather than a blank download.
 *   - No document / no 2D context (SSR, ancient browser) → resolve false.
 */
import { palette, fontFamilies } from '@era/tokens';

import { strings } from '@era/core/strings';
import type { OviWeather } from './types';

const CREAM = palette.light;

/** Story pixel size — the format every Era share card targets. */
const W = 1080;
const H = 1920;

/** A resolved reveal piece the export can draw (id-less; only pixels matter). */
export interface ExportPiece {
  url: string | null;
  slot: string | null;
}

interface ExportInput {
  pieces: readonly ExportPiece[];
  revealLine: string | null;
  weather: OviWeather | null;
}

/**
 * Resolve the actual loaded family name behind a CSS var (Next's `next/font`
 * hashes the family, so we can't hardcode 'Fraunces'). Reads the computed value
 * of the font var off `<html>`; falls back to the token fallback stack when the
 * var is empty or we're off-DOM.
 */
function resolveFamily(cssVar: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const resolved = getComputedStyle(document.documentElement)
    .getPropertyValue(cssVar)
    .trim();
  return resolved ? `${resolved}, ${fallback}` : fallback;
}

/** Load one image with CORS enabled; resolves null if it can't be fetched. */
function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/** Wrap `text` to `maxWidth`, returning the lines (already measured on `ctx`). */
function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * The layered stack geometry, mirroring RevealStage's SLOT_OFFSET so the export
 * reads the way the reveal composed the look. Values are fractions of the stage
 * box (centred in the frame), then scaled to px.
 */
const STACK_ORDER = ['shoes', 'bottom', 'base', 'outerwear', 'accessory'];
const OFFSET: Record<string, { x: number; y: number; scale: number }> = {
  shoes: { x: -0.14, y: 0.34, scale: 0.72 },
  bottom: { x: 0.1, y: 0.14, scale: 0.86 },
  base: { x: -0.06, y: -0.08, scale: 1 },
  outerwear: { x: 0.18, y: -0.02, scale: 0.92 },
  accessory: { x: -0.24, y: -0.3, scale: 0.5 },
};

function stackRank(slot: string | null): number {
  return slot ? STACK_ORDER.indexOf(slot) : STACK_ORDER.length;
}

/**
 * Draw the loaded cutouts into `ctx` in stack order, each at its slot offset.
 * Returns false if any draw taints the canvas (a cross-origin image without CORS
 * headers) — the caller then falls back to a text-only card.
 */
function drawStack(
  ctx: CanvasRenderingContext2D,
  loaded: readonly { img: HTMLImageElement; slot: string | null }[],
): boolean {
  const stageW = W * 0.62;
  const stageH = H * 0.5;
  const cx = W / 2;
  const cy = H * 0.46;
  const ordered = [...loaded].sort((a, b) => stackRank(a.slot) - stackRank(b.slot));
  for (const { img, slot } of ordered) {
    const off = (slot && OFFSET[slot]) || { x: 0, y: 0, scale: 0.8 };
    const boxW = stageW * off.scale;
    const ratio = img.height > 0 ? img.width / img.height : 1;
    const boxH = boxW / (ratio || 1);
    const x = cx + off.x * stageW - boxW / 2;
    const y = cy + off.y * stageH - boxH / 2;
    // Soft warm ground shadow under each piece, then the cutout.
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = CREAM.text;
    ctx.filter = 'blur(18px)';
    ctx.beginPath();
    ctx.ellipse(x + boxW / 2, y + boxH * 0.92, boxW * 0.32, boxH * 0.05, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.drawImage(img, x, y, boxW, boxH);
  }
  // A tainted canvas throws on read — probe once so the caller can degrade.
  try {
    ctx.getImageData(0, 0, 1, 1);
    return true;
  } catch {
    return false;
  }
}

/** Trigger a browser download of `blob` as `filename`. */
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next tick so the click has consumed the URL.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Compose and download the Today reveal as a 1080×1920 PNG. Resolves true once
 * the download is triggered, false on any failure the caller should toast. Never
 * throws: font, CORS, and context failures each degrade to a still-honest card
 * (or a false result) rather than surfacing an exception.
 */
export async function exportTodayStory(input: ExportInput): Promise<boolean> {
  if (typeof document === 'undefined') return false;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;

  try {
    // Best-effort: let the loaded faces settle so measureText/fillText use them.
    if (document.fonts?.ready) {
      await document.fonts.ready;
    }

    const serif = resolveFamily(fontFamilies.cssVar.serif, fontFamilies.serifFallback);
    const sans = resolveFamily(fontFamilies.cssVar.sans, fontFamilies.sansFallback);

    // Cream ground.
    ctx.fillStyle = CREAM.bg;
    ctx.fillRect(0, 0, W, H);

    const marginX = W * 0.1;

    // 'Today' — Fraunces largeTitle, top-left, editorial.
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = CREAM.text;
    ctx.font = `500 128px ${serif}`;
    ctx.fillText(strings.reveal.title, marginX, H * 0.16);

    // The weather whisper (secondary) under the title, when present.
    if (input.weather) {
      ctx.fillStyle = CREAM.secondaryStrong;
      ctx.font = `400 40px ${sans}`;
      const lead = strings.ovi.weatherLine(input.weather.tempC, input.weather.condition);
      ctx.fillText(lead, marginX, H * 0.16 + 60);
    }

    // The cutouts, layered — degrade to text-only if any taints the canvas.
    const drawable = input.pieces.filter((p): p is ExportPiece & { url: string } => p.url !== null);
    const loaded = (
      await Promise.all(
        drawable.map(async (p) => {
          const img = await loadImage(p.url);
          return img ? { img, slot: p.slot } : null;
        }),
      )
    ).filter((x): x is { img: HTMLImageElement; slot: string | null } => x !== null);

    let clean = true;
    if (loaded.length > 0) {
      clean = drawStack(ctx, loaded);
      if (!clean) {
        // Canvas is tainted: repaint the ground to wipe the cutouts and produce
        // the honest text-only card (still exportable — no taint on a fresh fill).
        ctx.fillStyle = CREAM.bg;
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = CREAM.text;
        ctx.font = `500 128px ${serif}`;
        ctx.fillText(strings.reveal.title, marginX, H * 0.16);
        if (input.weather) {
          ctx.fillStyle = CREAM.secondaryStrong;
          ctx.font = `400 40px ${sans}`;
          const lead = strings.ovi.weatherLine(input.weather.tempC, input.weather.condition);
          ctx.fillText(lead, marginX, H * 0.16 + 60);
        }
      }
    }

    // Ovi's italic line — Fraunces italic, ≥64px, centred low, wrapped.
    if (input.revealLine) {
      ctx.fillStyle = CREAM.text;
      ctx.font = `italic 500 68px ${serif}`;
      ctx.textAlign = 'center';
      const lines = wrapLines(ctx, input.revealLine, W - marginX * 2);
      const startY = H * 0.78;
      lines.forEach((line, i) => ctx.fillText(line, W / 2, startY + i * 84));
      ctx.textAlign = 'start';
    }

    // Watermark — ERA (45%) + era.style (70%), centred at the foot.
    ctx.textAlign = 'center';
    ctx.fillStyle = CREAM.text;
    ctx.globalAlpha = 0.45;
    ctx.font = `700 44px ${sans}`;
    // Tracked, uppercase — the wordmark treatment from ShareFrame.
    const wordmark = 'E R A';
    ctx.fillText(wordmark, W / 2, H - 120);
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = CREAM.secondaryStrong;
    ctx.font = `400 30px ${sans}`;
    ctx.fillText(strings.share.watermarkDomain, W / 2, H - 72);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'start';

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/png'),
    );
    if (!blob) return false;
    downloadBlob(blob, 'era-today.png');
    return true;
  } catch {
    return false;
  }
}
