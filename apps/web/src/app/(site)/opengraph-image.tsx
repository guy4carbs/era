import { strings } from '@era/core/strings';
import { buildOgImage, OG_SIZE, OG_CONTENT_TYPE } from '../../components/seo/og-image';

/**
 * The default share card for the `(site)` marketing group — a cream brand card
 * with the landing headline and the locked 'era.' mark, generated through the SEO
 * stack via the shared {@link buildOgImage} helper (built on `next/og`). Next
 * wires this into every (site) page's OpenGraph/Twitter metadata automatically;
 * segments that want their own headline (e.g. `/manifesto`) drop a sibling
 * `opengraph-image.tsx` that overrides this one.
 *
 * This replaces the old static `/og/era-og.png` reference — the card is now
 * generated per deploy from the tokens + the real mark, so it never drifts from
 * the brand.
 */
// Node runtime so buildOgImage can read the Fraunces TTF from disk via node:fs.
export const runtime = 'nodejs';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = strings.site.og.title;

export default function OpengraphImage() {
  return buildOgImage({ headline: strings.site.og.title });
}
