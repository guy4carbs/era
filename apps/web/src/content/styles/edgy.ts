import type { StylePageContent } from '../../lib/style-pages';

/**
 * Style content for `/styles/edgy`. Name, keywords, and palette hexes come from
 * `ARCHETYPES` in `@era/core/quiz`. Prose below is a short honest placeholder.
 *
 * TODO(content): expand intro (first ~150 words answering "edgy style"), palette
 * narrative, the five outfit formulas, and the gap guide.
 */
export const edgy: StylePageContent = {
  archetype: 'edgy',
  metaTitle: 'Edgy Style Guide: Outfits & Palette',
  metaDescription:
    'Edgy style is dark, sharp, and structured. Explore the palette, five outfit formulas, and how to build the wardrobe in Era.',
  dateModified: '2026-07-14',
  intro: [
    'Edgy style is dark and sharp — a structured, rebellious, moody look with hard edges and confident lines.',
    'This guide covers the palette, five outfit formulas, and the gaps worth closing.',
  ],
  paletteNarrative:
    'Near-black and charcoal dominate, cut with a deep oxblood so the mood stays moody, not flat.',
  outfitFormulas: [
    { name: 'Everyday dark', items: ['black tee', 'skinny jean', 'leather boot'], note: 'All-black, sharp fit.' },
    { name: 'Layered structure', items: ['moto jacket', 'hoodie', 'combat boot'], note: 'Hard shoulders.' },
    { name: 'Night out', items: ['leather trouser', 'sheer top', 'heeled boot'], note: 'Sleek and severe.' },
    { name: 'Cold-weather', items: ['longline coat', 'roll-neck', 'chunky boot'], note: 'Long, dark lines.' },
    { name: 'Off-duty', items: ['band tee', 'ripped denim', 'chelsea boot'], note: 'Undone but intentional.' },
  ],
  gapGuide: {
    intro: 'The pieces that most often complete an edgy wardrobe.',
    gaps: [
      { piece: 'A good leather jacket', why: 'The structural centerpiece of the whole look.' },
      { piece: 'A pair of hard boots', why: 'Grounds every outfit with attitude.' },
    ],
  },
  faqs: [
    {
      q: 'What is edgy style?',
      a: 'Edgy style is a dark, sharp, structured look with a rebellious, moody attitude — usually anchored in black with hard-edged pieces.',
    },
    {
      q: 'How do I find my style?',
      a: 'Take the style quiz in Era to see which of the eight archetypes fits you, then build outfits from the clothes you already own.',
    },
  ],
};
