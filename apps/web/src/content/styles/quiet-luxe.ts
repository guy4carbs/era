import type { StylePageContent } from '../../lib/style-pages';

/**
 * Style content for `/styles/quiet-luxe`. Name, keywords, and palette hexes come
 * from `ARCHETYPES` in `@era/core/quiz` — never duplicated here. Prose below is a
 * short honest placeholder.
 *
 * TODO(content): expand intro (first ~150 words answering "quiet luxe style"),
 * palette narrative, the five outfit formulas, and the gap guide. No dollar
 * amounts; link the style quiz via the landing.
 */
export const quietLuxe: StylePageContent = {
  archetype: 'quiet_luxe',
  metaTitle: 'Quiet Luxe Style Guide: Outfits & Palette',
  metaDescription:
    'Quiet luxe is understated, refined dressing that lets quality speak. Explore the palette, five outfit formulas, and how to build the wardrobe in Era.',
  dateModified: '2026-07-14',
  intro: [
    'Quiet luxe is understated, refined style that lets material and cut speak instead of logos. It favors timeless, quality-first pieces you keep for years.',
    'This guide covers the palette, five outfit formulas, and the wardrobe gaps worth closing.',
  ],
  paletteNarrative:
    'Warm neutrals and deep, tactile darks anchor the look; the accents stay muted so nothing shouts.',
  outfitFormulas: [
    { name: 'Weekend uniform', items: ['fine-gauge knit', 'tailored trouser', 'leather loafer'], note: 'Let texture carry it.' },
    { name: 'Quiet office', items: ['silk blouse', 'wool trouser', 'structured tote'], note: 'One considered accessory, no more.' },
    { name: 'Dinner out', items: ['column dress', 'fine-gold jewelry', 'sleek flat'], note: 'Refined over flashy.' },
    { name: 'Cold-weather layers', items: ['camel coat', 'cashmere scarf', 'ankle boot'], note: 'Long lines, warm tones.' },
    { name: 'Off-duty', items: ['soft tee', 'straight jean', 'suede sneaker'], note: 'Elevated basics only.' },
  ],
  gapGuide: {
    intro: 'The pieces that most often complete a quiet-luxe wardrobe.',
    gaps: [
      { piece: 'A well-cut neutral coat', why: 'Anchors every cold-weather look and lasts years.' },
      { piece: 'One quality leather shoe', why: 'Grounds tailoring and off-duty looks alike.' },
    ],
  },
  faqs: [
    {
      q: 'What is quiet luxe style?',
      a: 'Quiet luxe is understated dressing built on quality and cut rather than visible branding — timeless neutrals and refined pieces you keep for years.',
    },
    {
      q: 'How do I find my style?',
      a: 'Take the style quiz in Era to see which of the eight archetypes fits you, then build outfits from the clothes you already own.',
    },
  ],
};
