import type { Metadata } from 'next';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { LegalArticle } from '../../../components/site';
import { JsonLd, breadcrumbSchema } from '../../../components/seo';

/**
 * `/privacy` — the Privacy Policy. A server component that reads the
 * lawyer-authored markdown from disk and renders it as static, editorial prose
 * (zero client JS). `force-static` opts the route into static optimization; the
 * source file is committed, so the read happens at build. Inherits the `(site)`
 * quiet-luxury chrome + footer.
 */
export const dynamic = 'force-static';

export const metadata: Metadata = {
  // Bare title — the (site) template renders it as "Privacy Policy · Era" (no
  // "— Era" here, so the brand suffix isn't doubled).
  title: 'Privacy Policy',
  description: 'How Era collects, uses, and protects your data — and the choices and rights you have.',
  // Own canonical + OpenGraph so this page stops inheriting the homepage's og:url.
  alternates: { canonical: '/privacy' },
  openGraph: {
    type: 'article',
    url: '/privacy',
    siteName: 'Era',
    title: 'Privacy Policy · Era',
    description: 'How Era collects, uses, and protects your data — and the choices and rights you have.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Privacy Policy · Era',
    description: 'How Era collects, uses, and protects your data — and the choices and rights you have.',
  },
};

export default async function PrivacyPage() {
  const markdown = await readFile(
    join(process.cwd(), 'src/content/legal/privacy.md'),
    'utf8',
  );
  return (
    <>
      <JsonLd
        data={breadcrumbSchema([
          { name: 'Home', url: '/' },
          { name: 'Privacy Policy', url: '/privacy' },
        ])}
      />
      <LegalArticle markdown={markdown} />
    </>
  );
}
