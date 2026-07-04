import type { Metadata } from 'next';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { LegalArticle } from '../../../components/site';

/**
 * `/terms` — the Terms of Service. A server component that reads the
 * lawyer-authored markdown from disk and renders it as static, editorial prose
 * (zero client JS). `force-static` opts the route into static optimization; the
 * source file is committed, so the read happens at build. Inherits the `(site)`
 * quiet-luxury chrome + footer.
 */
export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'Terms of Service — Era',
  description: 'The agreement between you and Era for using the app.',
};

export default async function TermsPage() {
  const markdown = await readFile(
    join(process.cwd(), 'src/content/legal/terms.md'),
    'utf8',
  );
  return <LegalArticle markdown={markdown} />;
}
