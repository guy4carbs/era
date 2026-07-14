import type { StylePageContent } from '../../lib/style-pages';

/**
 * Style content for `/styles/streetwear`. Name, keywords, and palette hexes come
 * from `ARCHETYPES` in `@era/core/quiz`. Prose below is a short honest placeholder.
 *
 * TODO(content): expand intro (first ~150 words answering "streetwear style"),
 * palette narrative, the five outfit formulas, and the gap guide.
 */
export const streetwear: StylePageContent = {
  archetype: 'streetwear',
  metaTitle: 'Streetwear Style Guide: Outfits & Palette',
  metaDescription:
    'Streetwear style is bold, graphic, and sneaker-led. Explore the palette, five outfit formulas, and how to build the wardrobe in Era.',
  dateModified: '2026-07-14',
  intro: [
    'Streetwear is bold and expressive — a relaxed, graphic, sneaker-led look that puts personality up front.',
    'This guide covers the palette, five outfit formulas, and the gaps worth closing.',
  ],
  paletteNarrative:
    'Black, grey, and off-white ground the fit so a single loud accent can do the shouting.',
  outfitFormulas: [
    { name: 'Everyday fit', items: ['graphic tee', 'relaxed cargo', 'chunky sneaker'], note: 'Comfort with attitude.' },
    { name: 'Layered look', items: ['hoodie', 'oversized jacket', 'high-top'], note: 'Volume on volume.' },
    { name: 'Night out', items: ['boxy overshirt', 'black denim', 'statement sneaker'], note: 'Keep the shoe loud.' },
    { name: 'Cold-weather', items: ['puffer', 'sweatpant', 'beanie'], note: 'Function first.' },
    { name: 'Clean street', items: ['plain crew', 'straight jean', 'low-top'], note: 'Pared-back and sharp.' },
  ],
  gapGuide: {
    intro: 'The pieces that most often complete a streetwear wardrobe.',
    gaps: [
      { piece: 'One statement sneaker', why: 'Anchors and elevates the whole fit.' },
      { piece: 'A well-fitting hoodie', why: 'The layering base everything builds on.' },
    ],
  },
  faqs: [
    {
      q: 'What is streetwear style?',
      a: 'Streetwear is a bold, relaxed, sneaker-led look built on graphics and expressive layering, usually over a neutral base.',
    },
    {
      q: 'How do I find my style?',
      a: 'Take the style quiz in Era to see which of the eight archetypes fits you, then build outfits from the clothes you already own.',
    },
  ],
};
