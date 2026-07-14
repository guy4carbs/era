import type { StylePageContent } from '../../lib/style-pages';

/**
 * Style content for `/styles/eclectic`. Name, keywords, and palette hexes come
 * from `ARCHETYPES` in `@era/core/quiz`. Prose below is a short honest placeholder.
 *
 * TODO(content): expand intro (first ~150 words answering "eclectic style"),
 * palette narrative, the five outfit formulas, and the gap guide.
 */
export const eclectic: StylePageContent = {
  archetype: 'eclectic',
  metaTitle: 'Eclectic Style Guide: Outfits & Palette',
  metaDescription:
    'Eclectic style is playful, mixed, and color-forward. Explore the palette, five outfit formulas, and how to build the wardrobe in Era.',
  dateModified: '2026-07-14',
  intro: [
    'Eclectic style is playful and individual — a color-forward, mixed look that pairs the unexpected on purpose.',
    'This guide covers the palette, five outfit formulas, and the gaps worth closing.',
  ],
  paletteNarrative:
    'Teal, rust, and gold clash on purpose, with pink and turquoise accents keeping it lively.',
  outfitFormulas: [
    { name: 'Color clash', items: ['printed shirt', 'contrast trouser', 'bold flat'], note: 'Two prints, one anchor.' },
    { name: 'Texture mix', items: ['knit vest', 'satin skirt', 'sneaker'], note: 'High and low together.' },
    { name: 'Statement evening', items: ['sequin top', 'wide trouser', 'colored heel'], note: 'Lean into the loud.' },
    { name: 'Layered day', items: ['patterned cardigan', 'tee', 'straight jean'], note: 'Let the pattern lead.' },
    { name: 'Weekend play', items: ['colorblock jacket', 'cropped trouser', 'chunky loafer'], note: 'Unexpected pairings.' },
  ],
  gapGuide: {
    intro: 'The pieces that most often complete an eclectic wardrobe.',
    gaps: [
      { piece: 'One neutral anchor piece', why: 'Lets the bold items breathe instead of competing.' },
      { piece: 'A statement accessory', why: 'Ties a mixed outfit together with intent.' },
    ],
  },
  faqs: [
    {
      q: 'What is eclectic style?',
      a: 'Eclectic style is a playful, individual look that mixes colors, prints, and textures in unexpected combinations, usually over one grounding piece.',
    },
    {
      q: 'How do I find my style?',
      a: 'Take the style quiz in Era to see which of the eight archetypes fits you, then build outfits from the clothes you already own.',
    },
  ],
};
