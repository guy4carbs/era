import type { Metadata } from 'next';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { LegalArticle } from '../../../components/site';
import { JsonLd, breadcrumbSchema } from '../../../components/seo';

/**
 * `/terms` — the Terms of Service. A server component that reads the
 * lawyer-authored markdown from disk and renders it as static, editorial prose
 * (zero client JS). `force-static` opts the route into static optimization; the
 * source file is committed, so the read happens at build. Inherits the `(site)`
 * quiet-luxury chrome + footer.
 */
export const dynamic = 'force-static';

export const metadata: Metadata = {
  // Bare title — the (site) template renders it as "Terms of Service · Era" (no
  // "— Era" here, so the brand suffix isn't doubled).
  title: 'Terms of Service',
  description: 'The agreement between you and Era for using the app.',
  // Own canonical + OpenGraph so this page stops inheriting the homepage's og:url.
  alternates: { canonical: '/terms' },
  openGraph: {
    type: 'article',
    url: '/terms',
    siteName: 'Era',
    title: 'Terms of Service · Era',
    description: 'The agreement between you and Era for using the app.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Terms of Service · Era',
    description: 'The agreement between you and Era for using the app.',
  },
};

export default async function TermsPage() {
  const markdown = await readFile(
    join(process.cwd(), 'src/content/legal/terms.md'),
    'utf8',
  );
  return (
    <>
      <JsonLd
        data={breadcrumbSchema([
          { name: 'Home', url: '/' },
          { name: 'Terms of Service', url: '/terms' },
        ])}
      />
      <LegalArticle markdown={markdown} />
    </>
  );
}
