import type { StylePageContent } from '../../lib/style-pages';

/**
 * Style content for `/styles/classic`. Name, keywords, and palette hexes come
 * from `ARCHETYPES` in `@era/core/quiz`. Prose below is a short honest placeholder.
 *
 * TODO(content): expand intro (first ~150 words answering "classic style"),
 * palette narrative, the five outfit formulas, and the gap guide.
 */
export const classic: StylePageContent = {
  archetype: 'classic',
  metaTitle: 'Classic Style Guide: Outfits & Palette',
  metaDescription:
    'Classic style is tailored, polished, and enduring. Explore the palette, five outfit formulas, and how to build the wardrobe in Era.',
  dateModified: '2026-07-14',
  intro: [
    'Classic style is tailored and polished — a balanced, heritage-minded wardrobe that stays right season after season.',
    'This guide covers the palette, five outfit formulas, and the gaps worth closing.',
  ],
  paletteNarrative:
    'Navy, white, and camel do the heavy lifting, with a deep red or green as a considered accent.',
  outfitFormulas: [
    { name: 'Polished workday', items: ['blazer', 'white shirt', 'tailored trouser'], note: 'Crisp and balanced.' },
    { name: 'Weekend smart', items: ['knit polo', 'chino', 'loafer'], note: 'Easy but put together.' },
    { name: 'Evening standard', items: ['navy dress', 'pearl studs', 'court heel'], note: 'Understated, never fussy.' },
    { name: 'Cold-weather classic', items: ['camel coat', 'roll-neck', 'leather boot'], note: 'Timeless layers.' },
    { name: 'Off-duty', items: ['striped tee', 'straight jean', 'white sneaker'], note: 'Heritage basics.' },
  ],
  gapGuide: {
    intro: 'The pieces that most often complete a classic wardrobe.',
    gaps: [
      { piece: 'A navy blazer that fits', why: 'Dresses up almost anything already in the closet.' },
      { piece: 'A crisp white shirt', why: 'The anchor of every polished look.' },
    ],
  },
  faqs: [
    {
      q: 'What is classic style?',
      a: 'Classic style is a tailored, balanced wardrobe built on heritage pieces and neutral colors that stay relevant year after year.',
    },
    {
      q: 'How do I find my style?',
      a: 'Take the style quiz in Era to see which of the eight archetypes fits you, then build outfits from the clothes you already own.',
    },
  ],
};
