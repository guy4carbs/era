import { ImageResponse } from 'next/og';
import { palette } from '@era/tokens';

import { JOURNAL_SLUGS, JOURNAL_POSTS, isJournalSlug } from '../../../../lib/journal';

/**
 * The share card for a journal post — a quiet, editorial dark card built with
 * `next/og` (built in, no new dependency). No data source: the title comes from
 * the `journal.ts` registry, so every card is generated at build for the three
 * known slugs. Next wires this into the post's OpenGraph/Twitter metadata.
 */
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/** Prerender one card per known slug. */
export function generateStaticParams(): { slug: string }[] {
  return JOURNAL_SLUGS.map((slug) => ({ slug }));
}

/** Alt text is the post title — set per slug via image metadata. */
export async function generateImageMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<{ id: string; alt: string; size: typeof size; contentType: string }[]> {
  const { slug } = await params;
  const alt = isJournalSlug(slug) ? `${JOURNAL_POSTS[slug].title} — Era Journal` : 'An Era Journal article';
  return [{ id: 'og', alt, size, contentType }];
}

// Dark brand card — colours from the dark palette (token single source).
const COLORS = {
  bg: palette.dark.bg,
  text: palette.dark.text,
  accent: palette.dark.accent,
  muted: palette.dark.secondaryStrong,
} as const;

export default async function OpengraphImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<ImageResponse> {
  const { slug } = await params;
  const title = isJournalSlug(slug) ? JOURNAL_POSTS[slug].title : 'Journal';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px',
          background: COLORS.bg,
          color: COLORS.text,
        }}
      >
        <div
          style={{
            display: 'flex',
            fontSize: 28,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color: COLORS.accent,
          }}
        >
          Era · Journal
        </div>

        <div
          style={{
            display: 'flex',
            fontSize: 72,
            fontWeight: 600,
            lineHeight: 1.1,
            letterSpacing: '-0.02em',
            maxWidth: '900px',
          }}
        >
          {title}
        </div>

        <div style={{ display: 'flex', fontSize: 26, color: COLORS.muted }}>
          era.style
        </div>
      </div>
    ),
    size,
  );
}
