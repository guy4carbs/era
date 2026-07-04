import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { typeRamp } from '@era/tokens';

export interface LegalArticleProps {
  /** Raw markdown (already read from disk by the page). */
  markdown: string;
}

/**
 * Editorial renderer for the legal documents. A server component: it turns the
 * markdown into an HTML article at build time (the pages are `force-static`), so
 * it ships zero client JS. Raw HTML in the source is intentionally NOT enabled
 * (no rehype-raw) — GitHub-flavoured markdown only — which preserves the
 * no-injection guarantee for these lawyer-authored files.
 *
 * The prose is styled entirely from `@era/tokens`: the type ramp drives the
 * heading hierarchy and body size, `--space-*` the vertical rhythm, `--color-*`
 * the ink/accent/hairline, and a ~65ch measure keeps the line length readable.
 */
export function LegalArticle({ markdown }: LegalArticleProps) {
  return (
    <main className="era-prose">
      <style>{proseCss}</style>
      <article>
        <Markdown remarkPlugins={[remarkGfm]}>{markdown}</Markdown>
      </article>
    </main>
  );
}

// Scoped prose stylesheet, built from tokens. Kept as a single string (the same
// idiom the closet grid uses) so a server component can inject it without a
// client boundary. Every value traces to a token rem or a `var(--…)` custom prop.
const proseCss = [
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

  // Emphasis + inline code.
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
