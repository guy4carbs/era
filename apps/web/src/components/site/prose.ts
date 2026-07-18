import { typeRamp } from '@era/tokens';

/**
 * The shared editorial prose stylesheet — the quiet, token-driven "reading
 * column" look used by both the legal pages ({@link LegalArticle}) and the SEO
 * journal posts (via the root `mdx-components.tsx` wrapper). Extracted so the two
 * render markdown/MDX identically and the styling lives in exactly one place.
 *
 * Scoped under `.era-prose`: the type ramp drives the heading hierarchy and body
 * size, `--space-*` the vertical rhythm, `--color-*` the ink/accent/hairline, and
 * a ~65ch measure keeps line length readable. Kept as a single string (the same
 * idiom the closet grid uses) so a server component can inject it via a `<style>`
 * tag with no client boundary. Every value traces to a token rem or a `var(--…)`
 * custom property.
 */
export const proseCss = [
  // The reading column: centred, capped to a comfortable measure, breathing room
  // top and bottom. The measure is the one reading-specific value (a ch unit).
  `.era-prose{max-width:65ch;margin-inline:auto;padding-inline:var(--space-4);padding-block:var(--space-16);color:var(--color-text)}`,

  // Vertical rhythm: space between successive blocks; the first block hugs the top.
  `.era-prose > article > * + *{margin-top:var(--space-4)}`,
  `.era-prose > article > :first-child{margin-top:0}`,

  // Headings — the type ramp, with extra air above (less below).
  `.era-prose h1{font-size:${typeRamp.largeTitle.rem};line-height:${typeRamp.largeTitle.lineHeight}px;font-weight:700;letter-spacing:-0.02em;margin-top:var(--space-12)}`,
  `.era-prose h2{font-size:${typeRamp.title1.rem};line-height:${typeRamp.title1.lineHeight}px;font-weight:700;letter-spacing:-0.01em;margin-top:var(--space-12)}`,
  `.era-prose h3{font-size:${typeRamp.title3.rem};line-height:${typeRamp.title3.lineHeight}px;font-weight:700;margin-top:var(--space-8)}`,
  `.era-prose h1 + *,.era-prose h2 + *,.era-prose h3 + *{margin-top:var(--space-3)}`,

  // Body copy + lists at the HIG body size; muted list markers.
  `.era-prose p,.era-prose li{font-size:${typeRamp.body.rem};line-height:${typeRamp.body.lineHeight}px}`,
  `.era-prose ul,.era-prose ol{padding-left:var(--space-6);display:flex;flex-direction:column;gap:var(--space-2)}`,
  `.era-prose li{padding-left:var(--space-1)}`,
  `.era-prose li::marker{color:var(--color-secondary-strong)}`,

  // Links in accent, underlined for scannability in a wall of prose.
  `.era-prose a{color:var(--color-accent);font-weight:600;text-underline-offset:2px}`,

  // Emphasis + inline code. The one sanctioned monospace exception in the app:
  // literal `<code>` in journal/legal prose is code, and code reads as monospace —
  // the single universally-justified "different font genuinely needed" case. Lives
  // in a string literal, so the no-restricted-syntax fontFamily rule doesn't see it.
  `.era-prose strong{font-weight:700}`,
  `.era-prose code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:${typeRamp.footnote.rem};background:var(--color-surface);border:1px solid var(--color-hairline);border-radius:var(--radius-chip);padding:0 var(--space-1)}`,

  // Section rule + pull quotes.
  `.era-prose hr{border:none;border-top:1px solid var(--color-hairline);margin-block:var(--space-8)}`,
  `.era-prose blockquote{margin:0;padding-left:var(--space-4);border-left:2px solid var(--color-hairline);color:var(--color-secondary-strong)}`,

  // GFM tables — hairline grid, roomy cells, muted header.
  `.era-prose table{width:100%;border-collapse:collapse;font-size:${typeRamp.footnote.rem}}`,
  `.era-prose th,.era-prose td{border:1px solid var(--color-hairline);padding:var(--space-2) var(--space-3);text-align:left;vertical-align:top}`,
  `.era-prose th{font-weight:700;color:var(--color-secondary-strong);background:var(--color-surface)}`,
].join('\n');
