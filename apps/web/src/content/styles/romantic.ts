import type { StylePageContent } from '../../lib/style-pages';

/**
 * Style content for `/styles/romantic`. Name, keywords, and palette hexes come
 * from `ARCHETYPES` in `@era/core/quiz`. Prose below is a short honest placeholder.
 *
 * TODO(content): expand intro (first ~150 words answering "romantic style"),
 * palette narrative, the five outfit formulas, and the gap guide.
 */
export const romantic: StylePageContent = {
  archetype: 'romantic',
  metaTitle: 'Romantic Style Guide: Outfits & Palette',
  metaDescription:
    'Romantic style is soft, flowing, and delicate. Explore the palette, five outfit formulas, and how to build the wardrobe in Era.',
  dateModified: '2026-07-14',
  intro: [
    'Romantic style is soft and feminine — flowing, delicate pieces with a pretty, gentle mood.',
    'This guide covers the palette, five outfit formulas, and the gaps worth closing.',
  ],
  paletteNarrative:
    'Blush, cream, and soft sage set the tone, warmed by dusty rose and lilac accents.',
  outfitFormulas: [
    { name: 'Daytime pretty', items: ['floral blouse', 'midi skirt', 'ballet flat'], note: 'Movement over structure.' },
    { name: 'Soft workday', items: ['silk blouse', 'wide trouser', 'low heel'], note: 'Gentle, not stiff.' },
    { name: 'Evening romance', items: ['slip dress', 'fine cardigan', 'strappy heel'], note: 'Delicate layers.' },
    { name: 'Cool weather', items: ['wrap coat', 'knit dress', 'suede boot'], note: 'Soft lines, warm tones.' },
    { name: 'Weekend ease', items: ['broderie top', 'relaxed jean', 'mule'], note: 'Pretty and unfussy.' },
  ],
  gapGuide: {
    intro: 'The pieces that most often complete a romantic wardrobe.',
    gaps: [
      { piece: 'A flowing midi', why: 'Instantly delivers the soft, moving silhouette.' },
      { piece: 'A fine-knit cardigan', why: 'Layers over dresses without hardening the look.' },
    ],
  },
  faqs: [
    {
      q: 'What is romantic style?',
      a: 'Romantic style is a soft, feminine look built on flowing, delicate pieces and a gentle, pretty color palette.',
    },
    {
      q: 'How do I find my style?',
      a: 'Take the style quiz in Era to see which of the eight archetypes fits you, then build outfits from the clothes you already own.',
    },
  ],
};
