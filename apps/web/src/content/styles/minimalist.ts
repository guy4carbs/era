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
    'Picture getting dressed in the dark and still walking out coordinated — that is the promise it makes to anyone who finds deliberation exhausting. Wearing it feels light and uncluttered: a small set of interchangeable pieces means everything already goes with everything, so there is no wrong combination to stumble into. The freedom is in the constraint.',
    'Really it is one silhouette re-cut for context — the same clean line whether it lands in tailoring, in denim, or under a winter coat. Because the palette holds steady, nothing clashes and nothing has to be decided twice. That is what a system buys you: it disappears, which is the compliment minimalism is really after. You make each choice once, make it well, and then stop choosing.',
  ],
  paletteNarrative:
    'This is a study in restraint: pure white and a warm off-white on one end, a soft light grey in the middle, and a near-black at the other. The two accents, a muted slate blue and a mid grey, barely break the monochrome; they add just enough coolness to keep the whole thing from reading flat. Build head-to-toe in one or two of these tones and let fit, not color, carry the outfit.',
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
      'A minimalist wardrobe grows by subtraction, so admitting a gap feels almost contradictory. When a real one exists it is structural — a single piece the whole system routes around, without which two or three outfits never quite resolve. Close that one. Anything you would merely like the look of is clutter you have not bought yet.',
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
      a: "Compare what you actually wear to what you own. If the same few clean, well-fitting pieces come out on repeat while a drawer of hopeful colours stays shut — and dressing fast matters to you more than variety — you already behave like a minimalist. Era's quiz confirms it, then builds outfits from the pieces that pull their weight so the rest can go.",
    },
  ],
};
