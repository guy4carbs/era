import type { StylePageContent } from '../../lib/style-pages';

/**
 * Style content for `/styles/athleisure`. Name, keywords, and palette hexes come
 * from `ARCHETYPES` in `@era/core/quiz`. Prose below is a short honest placeholder.
 *
 * TODO(content): expand intro (first ~150 words answering "athleisure style"),
 * palette narrative, the five outfit formulas, and the gap guide.
 */
export const athleisure: StylePageContent = {
  archetype: 'athleisure',
  metaTitle: 'Athleisure Style Guide: Outfits & Palette',
  metaDescription:
    'Athleisure style is sporty, comfortable, and sleek. Explore the palette, five outfit formulas, and how to build the wardrobe in Era.',
  dateModified: '2026-07-14',
  intro: [
    'Athleisure is sporty and comfortable — a functional, sleek look that moves from the gym to the day without missing a beat.',
    'This guide covers the palette, five outfit formulas, and the gaps worth closing.',
  ],
  paletteNarrative:
    'Black, white, and warm grey keep it clean, with a bright mint or blue as the active accent.',
  outfitFormulas: [
    { name: 'Everyday active', items: ['fitted tee', 'jogger', 'running sneaker'], note: 'Move-ready and clean.' },
    { name: 'Studio to street', items: ['zip hoodie', 'legging', 'trainer'], note: 'Layer for the walk home.' },
    { name: 'Elevated sport', items: ['knit polo', 'tech trouser', 'minimal sneaker'], note: 'Sleek, not sloppy.' },
    { name: 'Cool weather', items: ['track jacket', 'sweatpant', 'high-top'], note: 'Warm and functional.' },
    { name: 'Rest day', items: ['boxy tee', 'bike short', 'slide'], note: 'Comfort, kept tidy.' },
  ],
  gapGuide: {
    intro: 'The pieces that most often complete an athleisure wardrobe.',
    gaps: [
      { piece: 'One clean everyday sneaker', why: 'Bridges workout and street without looking gym-only.' },
      { piece: 'A sleek zip layer', why: 'Makes activewear read as an intentional outfit.' },
    ],
  },
  faqs: [
    {
      q: 'What is athleisure style?',
      a: 'Athleisure is a sporty, comfortable look built on functional, sleek activewear that works beyond the gym for everyday wear.',
    },
    {
      q: 'How do I find my style?',
      a: 'Take the style quiz in Era to see which of the eight archetypes fits you, then build outfits from the clothes you already own.',
    },
  ],
};
