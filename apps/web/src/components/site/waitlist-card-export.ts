/**
 * The waitlist gift → Stories export (D-GIFT, web).
 *
 * Composes a 1080×1920 share PNG entirely on an offscreen `<canvas>`: the cream
 * ground, "You're in." large in Fraunces serif, the joiner's position numeral
 * huge in Fraunces beneath it, and the ERA / era.style watermark (the same
 * ShareFrame treatment reveal-export uses: wordmark at 45% opacity, domain at
 * 70%). Downloads via `toBlob` → object URL → a synthetic `<a download>`.
 *
 * WHY THE LITERAL COLOURS: a canvas 2D context cannot read CSS custom
 * properties (`getComputedStyle` on canvas returns nothing useful for fills), so
 * the palette is imported directly from `@era/tokens` and drawn as literal hex —
 * the same sanctioned pattern the transactional email templates and
 * reveal-export.ts use. This file is allowlisted in design-consistency.test.ts
 * for exactly that reason.
 *
 * Honest degradation, never a throw at the user:
 *   - Fonts unavailable → draw with the serif/sans fallback stacks.
 *   - No document / no 2D context (SSR, ancient browser) → resolve false.
 * There are no external images to taint the canvas here (text-only card), so the
 * CORS-degradation branch reveal-export needs has no analog.
 */
import { palette, fontFamilies } from '@era/tokens';

import { strings } from '@era/core/strings';

const CREAM = palette.light;

/** Story pixel size — the format every Era share card targets. */
const W = 1080;
const H = 1920;

interface WaitlistCardInput {
  /** The joiner's 1-based place in line — rendered huge in Fraunces numerals. */
  position: number;
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
 * Compose and download the waitlist gift as a 1080×1920 PNG. Resolves true once
 * the download is triggered, false on any failure the caller should toast. Never
 * throws: font and context failures degrade to a still-honest card (or a false
 * result) rather than surfacing an exception.
 */
export async function exportWaitlistCard(input: WaitlistCardInput): Promise<boolean> {
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

    // "You're in." — Fraunces, centred in the upper third, editorial.
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = CREAM.text;
    ctx.font = `500 128px ${serif}`;
    ctx.fillText(strings.site.gift.heading, W / 2, H * 0.34);

    // The position numeral — the hero, huge in Fraunces, centred.
    ctx.fillStyle = CREAM.text;
    ctx.font = `500 320px ${serif}`;
    ctx.fillText(`${input.position}`, W / 2, H * 0.6);

    // The accessible position line beneath, quiet in Geist.
    ctx.fillStyle = CREAM.secondaryStrong;
    ctx.font = `400 44px ${sans}`;
    ctx.fillText(strings.site.gift.positionLabel(input.position), W / 2, H * 0.68);

    // Watermark — ERA (45%) + era.style (70%), centred at the foot. Matches the
    // reveal-export / ShareFrame treatment so every card carries the same mark.
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
    downloadBlob(blob, 'era-waitlist.png');
    return true;
  } catch {
    return false;
  }
}
