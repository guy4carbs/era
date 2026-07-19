/**
 * glass — the frosted-surface recipe (nav bars, sheets, floating panels).
 *
 * A backdrop blur under a translucent mode tint, finished with a 1px border and
 * a hairline inner highlight along the top edge to catch light like real glass.
 * Numbers are the §3 spec exactly: light `rgba(250,247,240,0.72)` tint with a
 * bright 55% top highlight; dark `rgba(28,27,25,0.62)` with a faint 6% one.
 */

export const glass = {
  blur: 20,
  // saturate — a slight saturation boost behind glass so garments glow through
  // it (§3). Web: `backdrop-filter: blur(20px) saturate(1.1)`. Mobile BlurView
  // exposes no saturation control — iOS system materials already apply mild
  // vibrancy, so the divergence is cosmetic and documented, not hidden.
  saturate: 1.1,
  // TUNED 2026-07-18 (user call, on-device): the §3 doc's 0.72/0.62 read as a
  // heavy frosted strip over the app's own chrome — dialed more translucent so
  // content ghosts through. Light 0.60 STILL clears AA over a worst-case black
  // backdrop (5.46:1, asserted in tests), so default light glass keeps the
  // any-backdrop guarantee; dark chrome glass is dark-on-dark (trivially AA).
  // Imagery surfaces use busyTintOpacity below, which stays AA-locked.
  tintOpacity: {
    light: 0.6,
    dark: 0.55,
  },
  // busyTintOpacity — the minimum-contrast scrim strength for glass floating
  // over BUSY backdrops (imagery: cutouts, try-on renders, photos). Surfaces
  // declare `busy` and swap to this tint. The DARK value is AA-derived: cream
  // text on the 0.62 dark tint composited over a worst-case WHITE backdrop
  // measures ~4.0:1 (FAILS 4.5); at 0.88 it measures ~9.4:1 — guaranteed AA
  // over ANY backdrop. Light already guarantees AA at 0.72 (ink text over the
  // tint on pure black ≈ 7.7:1), so busy leaves it unchanged. Asserted with
  // the real WCAG math in tokens.test.ts — the guarantee is machine-checked.
  busyTintOpacity: {
    light: 0.72,
    dark: 0.88,
  },
  borderWidth: 1,
  // border — the 1px frame, per mode: warm ink at 8% on light, warm cream at 8%
  // on dark (§3: rgba(28,27,25,0.08) / rgba(245,241,232,0.08)).
  border: {
    light: 'rgba(28, 27, 25, 0.08)',
    dark: 'rgba(245, 241, 232, 0.08)',
  },
  // innerHighlight — a 1px white top-edge catch-light. Bright on light glass
  // (0.55), barely-there on dark (0.06) where a bright line would glow.
  innerHighlight: {
    color: '#FFFFFF',
    opacity: {
      light: 0.55,
      dark: 0.06,
    },
    height: 1,
  },
  // innerHighlightColor — the highlight pre-composed as ready-to-use rgba
  // strings (color at its per-mode opacity), for consumers that need a single
  // colour value (CSS box-shadow, RN gradient stop).
  innerHighlightColor: {
    light: 'rgba(255, 255, 255, 0.55)',
    dark: 'rgba(255, 255, 255, 0.06)',
  },
} as const;
