import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { proseCss } from './prose';

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
