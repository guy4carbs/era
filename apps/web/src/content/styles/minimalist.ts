import type { StylePageContent } from '../../lib/style-pages';

/**
 * Style content for `/styles/minimalist`. Name, keywords, and palette hexes come
 * from `ARCHETYPES` in `@era/core/quiz`. Prose below is a short honest placeholder.
 *
 * TODO(content): expand intro (first ~150 words answering "minimalist style"),
 * palette narrative, the five outfit formulas, and the gap guide.
 */
export const minimalist: StylePageContent = {
  archetype: 'minimalist',
  metaTitle: 'Minimalist Style Guide: Outfits & Palette',
  metaDescription:
    'Minimalist style is clean, essential, and uncluttered. Explore the palette, five outfit formulas, and how to build the wardrobe in Era.',
  dateModified: '2026-07-14',
  intro: [
    'Minimalist style is clean and essential — a precise, uncluttered wardrobe where every piece earns its place and nothing is decorative.',
    'This guide covers the palette, five outfit formulas, and the gaps worth closing.',
  ],
  paletteNarrative:
    'A near-monochrome base of white, grey, and black, with one cool accent used sparingly.',
  outfitFormulas: [
    { name: 'Everyday essential', items: ['white tee', 'straight trouser', 'clean sneaker'], note: 'Fit is the whole story.' },
    { name: 'Monochrome work', items: ['grey knit', 'tailored trouser', 'leather loafer'], note: 'Tonal, top to toe.' },
    { name: 'Sharp evening', items: ['black shift', 'minimal heel', 'small clutch'], note: 'No embellishment needed.' },
    { name: 'Layered cold', items: ['long coat', 'fine knit', 'ankle boot'], note: 'Straight lines only.' },
    { name: 'Relaxed weekend', items: ['boxy tee', 'wide jean', 'flat sandal'], note: 'Ease without clutter.' },
  ],
  gapGuide: {
    intro: 'The pieces that most often complete a minimalist wardrobe.',
    gaps: [
      { piece: 'A perfect white shirt', why: 'The backbone of the whole palette.' },
      { piece: 'One clean leather sneaker', why: 'Reads polished across nearly every look.' },
    ],
  },
  faqs: [
    {
      q: 'What is minimalist style?',
      a: 'Minimalist style is a clean, essential wardrobe in a tight neutral palette, where fit and quality matter more than pattern or decoration.',
    },
    {
      q: 'How do I find my style?',
      a: 'Take the style quiz in Era to see which of the eight archetypes fits you, then build outfits from the clothes you already own.',
    },
  ],
};
