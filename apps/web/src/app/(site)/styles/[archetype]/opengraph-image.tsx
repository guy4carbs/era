import { ImageResponse } from 'next/og';
import { ARCHETYPES } from '@era/core/quiz';

import { STYLE_SLUGS, isStyleSlug, slugToArchetype } from '../../../../lib/style-pages';

/**
 * The share card for a style-archetype page — a palette band under the archetype
 * name, built with `next/og`. Colors come straight from `ARCHETYPES`
 * (`@era/core/quiz`); no data source, so every card is generated at build for the
 * eight known slugs. Next wires this into the page's OpenGraph/Twitter metadata.
 */
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/** Prerender one card per known slug. */
export function generateStaticParams(): { archetype: string }[] {
  return STYLE_SLUGS.map((slug) => ({ archetype: slug }));
}

/** Alt text names the archetype — set per slug via image metadata. */
export async function generateImageMetadata({
  params,
}: {
  params: Promise<{ archetype: string }>;
}): Promise<{ id: string; alt: string; size: typeof size; contentType: string }[]> {
  const { archetype } = await params;
  const id = slugToArchetype(archetype);
  const alt = id ? `${ARCHETYPES[id].name} — Era style guide` : 'An Era style archetype';
  return [{ id: 'og', alt, size, contentType }];
}

const COLORS = {
  bg: '#1C1B19',
  text: '#F5F1E8',
  accent: '#C9BEA9',
} as const;

export default async function OpengraphImage({
  params,
}: {
  params: Promise<{ archetype: string }>;
}): Promise<ImageResponse> {
  const { archetype } = await params;
  const id = isStyleSlug(archetype) ? slugToArchetype(archetype) : undefined;
  const def = id ? ARCHETYPES[id] : null;
  const palette = def ? [...def.anchorHexes, ...def.accentHexes] : [];
  const name = def ? def.name : 'Style Guide';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: COLORS.bg,
          color: COLORS.text,
        }}
      >
        {/* Palette band — equal-width color blocks across the top third. */}
        <div style={{ display: 'flex', width: '100%', height: '210px' }}>
          {palette.map((hex, index) => (
            <div key={`${hex}-${index}`} style={{ display: 'flex', flex: 1, background: hex }} />
          ))}
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            flex: 1,
            padding: '72px',
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
            Era · Style Guide
          </div>
          <div style={{ display: 'flex', fontSize: 84, fontWeight: 600, letterSpacing: '-0.02em' }}>
            {name}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
