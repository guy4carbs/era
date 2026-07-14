import type { StylePageContent } from '../../lib/style-pages';

/**
 * Style content for `/styles/eclectic`. Name, keywords, and palette hexes come
 * from `ARCHETYPES` in `@era/core/quiz`. Prose below is the published page copy.
 */
export const eclectic: StylePageContent = {
  archetype: 'eclectic',
  metaTitle: 'Eclectic Style Guide: Bold Color, Mixed Looks',
  metaDescription:
    'Eclectic style is playful, color-forward, and personal. How its clashing palette works, five outfit formulas, and the one calm piece that ties it together.',
  dateModified: '2026-07-14',
  intro: [
    'Eclectic style is the art of the unexpected pairing — playful, colour-forward, and unmistakably individual. Where other archetypes narrow their palette, this one widens it: prints meet prints, textures collide, and a bright that supposedly should not work becomes the whole point. It is personal by design, less a formula than a permission slip.',
    'The catch is that it only looks effortless. Behind a good eclectic outfit is usually one grounding decision — a neutral, a repeated colour, a single anchor — that gives everything else room to be loud. Take that decision away and the same pieces tip from expressive into chaotic.',
    'It suits collectors and magpies: people whose favourite items each carry a story, who would rather a wardrobe that surprises them than one that matches. If you have ever bought something purely because nothing else looked like it, this is probably your territory.',
    'Of the eight archetypes this is the most expressive, and the one that best rewards the odd things already in your closet — the vintage jacket, the one printed skirt that never had a home, finally find their place. The skill is arrangement, not restraint: knowing which two things to let shout and what to keep quiet underneath them.',
  ],
  paletteNarrative:
    'This is the one archetype whose palette is built to clash: deep teal, burnt rust, and warm mustard sit beside a rich violet, none of them backing down. Magenta and turquoise accents push the energy up rather than calming it. Wear it by letting two or three shades lead and anchoring the rest with a single neutral, so the colour reads as a choice instead of an accident.',
  outfitFormulas: [
    {
      name: 'Print on print',
      items: ['patterned shirt', 'contrasting midi skirt', 'solid loafer'],
      note: 'Two prints work when they share one colour; the shoe stays plain.',
    },
    {
      name: 'Creative Monday',
      items: ['colourblock knit', 'wide trouser', 'bold ankle boot'],
      note: 'Blocks of flat colour read bold without a single print.',
    },
    {
      name: 'Loud evening',
      items: ['metallic top', 'tailored trouser', 'jewel-tone heel'],
      note: 'One shine, one saturated colour — nothing else needs to happen.',
    },
    {
      name: 'Layered transition',
      items: ['printed cardigan', 'plain tee', 'straight jean', 'sneaker'],
      note: 'A neutral base under the pattern makes it wearable all day.',
    },
    {
      name: 'Weekend mix',
      items: ['vintage jacket', 'graphic tee', 'cropped trouser', 'chunky sandal'],
      note: 'Pull one colour from the jacket into the rest to tie it together.',
    },
  ],
  gapGuide: {
    intro:
      'The honest test for an eclectic wardrobe is counterintuitive: the piece you are missing is usually the calm one. Not another bright — you have plenty — but the anchor that would let the brights already crowding your closet finally combine. A gap here is whatever opens up pairings you cannot currently pull off, which nearly always means something quiet to build the loud things on.',
    gaps: [
      {
        piece: 'A true neutral anchor',
        why: 'A plain trouser, tee, or coat in black, cream, or denim gives the bold pieces somewhere to rest, so a mixed outfit reads intentional.',
      },
      {
        piece: 'A statement accessory',
        why: 'A single bold belt, bag, or pair of earrings can be the deliberate note that ties an otherwise scattered look together.',
      },
      {
        piece: 'One versatile print',
        why: 'A print that shares a colour with several things you own multiplies your pairings instead of sitting alone in the closet.',
      },
      {
        piece: 'A solid mid-layer',
        why: 'A plain cardigan or jacket lets you turn the volume down on a busy day without abandoning the palette.',
      },
    ],
  },
  faqs: [
    {
      q: 'What is eclectic style?',
      a: 'Eclectic style is a playful, individual look that mixes colours, prints, and textures in unexpected combinations. It deliberately pairs things that supposedly should not go together, usually over one grounding piece that keeps the outfit from tipping into chaos.',
    },
    {
      q: 'Isn’t eclectic just wearing whatever you want?',
      a: 'Not quite. It looks free-form, but a good eclectic outfit almost always has a hidden discipline — a repeated colour, a neutral base, or a single anchor. That structure is what separates expressive from messy.',
    },
    {
      q: 'How do I keep an eclectic outfit from looking messy?',
      a: 'Anchor it. Let two or three elements be loud and hold the rest steady with a neutral, or thread one shared colour through the whole look. Editing to a single point of calm is what makes the boldness feel intentional.',
    },
    {
      q: 'Can eclectic style ever be minimal, or is it always maximal?',
      a: 'It can be quiet. Eclectic is about unexpected combinations, not sheer volume — an otherwise simple outfit with one surprising pairing still counts. The individuality matters more than the amount.',
    },
    {
      q: 'How can I check whether eclectic is really my style?',
      a: 'The giveaway is the pieces you love and never wear — the ones too singular to pair with anything, bought precisely because nothing else looked like them. A closet full of those, with few plain anchors between them, points straight at eclectic. Era’s quiz weighs that pattern and tells you whether eclectic leads the wardrobe or only guests in it.',
    },
  ],
};
