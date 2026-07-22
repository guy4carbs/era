import { strings } from '@era/core/strings';
import { buildOgImage, OG_SIZE, OG_CONTENT_TYPE } from '../../../components/seo/og-image';

/**
 * The `/manifesto` share card — the north star as the headline over the shared
 * cream brand card ({@link buildOgImage}, built on `next/og`), with a quiet
 * 'Manifesto' eyebrow. Overrides the group-level `(site)` opengraph-image for this
 * segment so the card carries the page's own line. Next wires it into the page's
 * OpenGraph/Twitter metadata automatically.
 */
// Node runtime so buildOgImage can read the Fraunces TTF from disk via node:fs.
export const runtime = 'nodejs';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = `${strings.site.manifesto.northStar} — Era`;

export default function OpengraphImage() {
  return buildOgImage({
    headline: strings.site.manifesto.northStar,
    eyebrow: 'Manifesto',
  });
}
