import type { StylePageContent } from '../../lib/style-pages';

/**
 * Style content for `/styles/minimalist`. Name, keywords, and palette hexes come
 * from `ARCHETYPES` in `@era/core/quiz` — never duplicated here.
 */
export const minimalist: StylePageContent = {
  archetype: 'minimalist',
  metaTitle: 'Minimalist Style: Capsule Outfits & Palette',
  metaDescription:
    'Minimalist style pares a wardrobe to clean, essential pieces in one palette. See the colors, five capsule outfit formulas, and the gaps worth closing.',
  dateModified: '2026-07-14',
  intro: [
    'Minimalist style is a wardrobe reduced to its essentials and nothing else. Every piece earns its place through clean lines, precise fit, and a monochrome or near-monochrome palette, so the eye has nowhere to snag. It is less a look than a discipline: keep only what works, and make sure it works completely.',
    'It suits people who find decision fatigue exhausting and would rather get dressed in thirty seconds than deliberate. Wearing it feels light and uncluttered — a small set of interchangeable pieces means everything already goes with everything, so there is no wrong combination to stumble into. The freedom is in the constraint.',
    'Through the week it looks like the same precise silhouette re-cut for context: a crisp shirt and tailored trouser on Monday, the trouser swapped for straight-leg denim by Friday, a clean knit thrown over on a cold morning. Because the palette holds steady, nothing clashes and nothing has to be thought about twice. You are not repeating outfits so much as running a system — and done right, it disappears, which is the compliment it is after. Fewer choices, each made once and made well, is the whole trade you are signing up for.',
  ],
  paletteNarrative:
    'This is a study in restraint: pure white and a warm off-white on one end, a soft light grey in the middle, and a near-black at the other. The two accents, a muted slate blue and a mid grey, barely break the monochrome; they add just enough coolness to keep the whole thing from reading flat. Build head-to-toe in one or two of these tones and let fit, not color, do the work.',
  outfitFormulas: [
    {
      name: 'Uniform of one',
      items: ['crisp white shirt', 'tailored black trouser', 'minimal leather sneaker'],
      note: 'One color story, sharp fit — the whole outfit lives in the tailoring.',
    },
    {
      name: 'Monochrome evening',
      items: ['black column dress', 'fine silver stud', 'square-toe flat'],
      note: 'Subtract until only the silhouette is left.',
    },
    {
      name: 'Clean commute',
      items: [
        'fine grey knit',
        'straight-leg trouser',
        'structured minimal tote',
        'ankle boot',
      ],
      note: 'Tonal top to bottom so nothing competes for attention.',
    },
    {
      name: 'Winter in greys',
      items: ['long grey wool coat', 'white roll-neck', 'tapered trouser'],
      note: 'Stay within two greys and the layers read as one piece.',
    },
    {
      name: 'Errand run',
      items: ['white tee', 'straight-leg denim', 'clean low-top sneaker'],
      note: 'The plainest version of the uniform, still deliberate.',
    },
  ],
  gapGuide: {
    intro:
      'In a minimalist wardrobe a gap is rarely about adding — it is about the one missing piece that keeps a clean outfit from resolving. Only close a gap when it unlocks looks the current set cannot make; otherwise it is just clutter with a receipt.',
    gaps: [
      {
        piece: 'A perfectly fitting white shirt',
        why: 'The keystone of nearly every formula here; without it the uniform never quite lands.',
      },
      {
        piece: 'One neutral tailored trouser',
        why: 'Pairs with every top in the palette, so a single trouser multiplies the outfits you can build.',
      },
      {
        piece: 'A clean low-profile sneaker',
        why: 'Bridges the evening and errand looks, so one shoe covers most of the week.',
      },
      {
        piece: 'A long coat in a core grey or black',
        why: 'Keeps winter inside the monochrome instead of forcing a louder outer layer.',
      },
    ],
  },
  faqs: [
    {
      q: 'What is minimalist style?',
      a: 'Minimalist style is a wardrobe stripped to its essentials, built on clean lines, precise fit, and a monochrome or near-monochrome palette. The goal is a small set of interchangeable pieces where everything already coordinates, so getting dressed is quick and nothing feels cluttered.',
    },
    {
      q: 'How many pieces should a minimalist wardrobe have?',
      a: 'There is no magic number; the real test is whether every piece is worn and everything combines. A capsule of well-chosen essentials in one palette will out-perform a full closet of one-off buys.',
    },
    {
      q: 'Is minimalist style the same as a capsule wardrobe?',
      a: 'They are close cousins. A capsule is any small, coordinated set for a season or period; minimalist style is the broader aesthetic of clean lines and restraint that a capsule usually expresses. You can run a capsule that is not minimalist, but most minimalists run one.',
    },
    {
      q: 'Does minimalist style have to mean all black and white?',
      a: 'No. Monochrome is the easiest version, but a minimalist palette can center on greys, warm neutrals, or a single muted accent. What matters is tight color discipline, not the specific colors.',
    },
    {
      q: 'How do I know if minimalist is my style?',
      a: "If you gravitate to clean fits, a narrow palette, and fewer decisions, it probably is. Era's style quiz places you among the eight archetypes and then builds outfits from clothes you already own, which is a fast way to confirm the fit.",
    },
  ],
};
