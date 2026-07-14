import type { StylePageContent } from '../../lib/style-pages';

/**
 * Style content for `/styles/streetwear`. Name, keywords, and palette hexes come
 * from `ARCHETYPES` in `@era/core/quiz` — never duplicated here.
 */
export const streetwear: StylePageContent = {
  archetype: 'streetwear',
  metaTitle: 'Streetwear Style: Outfits, Palette & Sneakers',
  metaDescription:
    'Streetwear is bold, graphic, sneaker-led dressing built on comfort and self-expression. See the palette, five formulas, and the key pieces to own.',
  dateModified: '2026-07-14',
  intro: [
    'Streetwear is style built from the ground up — literally, since the sneakers usually come first and the outfit is assembled around them. It is bold, graphic, and relaxed in fit, drawing on skate, hip-hop, and sport culture to make clothes a form of self-expression rather than a uniform. The rules are loose on purpose: comfort and attitude outrank formality every time.',
    'Getting dressed here is treated as a creative act — the clothes are meant to say something before you open your mouth. Wearing it feels easy and a little playful: roomy silhouettes move with you, a graphic carries the message, and there is always room to swap one loud element for another. Nothing here is precious.',
    'The system is loose on purpose. You start from the shoes and the fit, then set the volume: a muted base letting one bright piece pop on an ordinary day, everything turned up when the mood asks for it. Only that through-line stays fixed — footwear and silhouette lead, and any single garment is swappable. You build it by feel, one favorite piece at a time, and it never quite stops rearranging.',
  ],
  paletteNarrative:
    'Streetwear runs on a neutral base — black, mid grey, and a soft off-white — so the loud pieces have room to land. Against that, the accents go deliberately electric: a hot red-orange and a bright yellow, the kind of color meant to be seen from across the street. Keep most of a fit grounded in the neutrals and let a single accent — a sneaker, a graphic, a cap — carry the volume.',
  outfitFormulas: [
    {
      name: 'Everyday fit',
      items: ['graphic tee', 'relaxed straight denim', 'clean chunky sneaker', 'cap'],
      note: 'Neutral clothes, one graphic — let the print and the shoe lead.',
    },
    {
      name: 'Layered for cold',
      items: ['hoodie', 'oversized bomber jacket', 'cargo trouser', 'high-top sneaker'],
      note: 'Stack loose layers and keep them all in the neutral base.',
    },
    {
      name: 'Loud sneaker day',
      items: [
        'plain tee',
        'tapered sweatpant',
        'statement bright sneaker',
        'crossbody bag',
      ],
      note: 'Build the whole fit quiet so the trainers can shout.',
    },
    {
      name: 'Sport-lounge',
      items: ['track jacket', 'relaxed jogger', 'retro runner'],
      note: 'Full sport reference, worn off the field on purpose.',
    },
    {
      name: 'Tonal all-black',
      items: ['black boxy tee', 'black wide-leg trouser', 'black sneaker', 'black beanie'],
      note: 'One color head to toe reads intentional, not lazy — texture is the variety.',
    },
  ],
  gapGuide: {
    intro:
      'Watch your rotation and the gap shows itself: it is the fit you keep reaching to build and abandoning because one piece is not there yet — almost always the shoe or the standout layer, almost never another basic. If a buy would not enter the rotation and change what you can put together, it is just stock piling up.',
    gaps: [
      {
        piece: 'One statement pair of sneakers',
        why: 'Becomes the centerpiece an entire relaxed, neutral fit can be built around.',
      },
      {
        piece: 'A well-cut hoodie in a neutral',
        why: 'Layers under jackets and stands alone, anchoring most of the cold-weather looks here.',
      },
      {
        piece: 'A relaxed or oversized outer jacket',
        why: 'A bomber or coach jacket adds the layer that turns warm-weather fits into cold-weather ones without losing the silhouette.',
      },
      {
        piece: 'A couple of strong graphic tees',
        why: 'Supply the expressive element the neutral base is built to frame.',
      },
    ],
  },
  faqs: [
    {
      q: 'What is streetwear style?',
      a: 'Streetwear is a bold, graphic, relaxed-fit style rooted in skate, hip-hop, and sport culture, where sneakers usually lead and the outfit is built around them. It prizes comfort and self-expression over formality, mixing statement pieces with neutral basics so one loud element can stand out.',
    },
    {
      q: 'What shoes work for streetwear?',
      a: 'Sneakers are the heart of it — chunky trainers, retro runners, high-tops, and skate shoes all fit. Because footwear leads the look, one distinctive pair is often worth more to a streetwear wardrobe than several plain ones.',
    },
    {
      q: 'How do I wear streetwear without looking over the top?',
      a: 'Ground the fit in neutrals and let a single piece be loud — one graphic, one bright sneaker, or one bold layer at a time. Relaxed fit reads as intentional when the palette stays disciplined around the statement.',
    },
    {
      q: 'Is streetwear still in style?',
      a: 'It is a slightly odd question for streetwear, because the culture grew up outside the trend cycle rather than inside it — being current was never the aim. Individual hyped pieces come and go fast, but dressing from the sneakers up, for comfort and self-expression, has only spread. Chase the hype and you date yourself; build from the fundamentals and you do not.',
    },
    {
      q: 'How do I know if streetwear is my style?',
      a: "Start at your feet. If the sneakers are the first decision and the rest of the fit gets built up from there — if the pieces you are proudest of are the loud, comfortable, one-graphic-at-a-time kind — you are already dressing streetwear. Era's quiz names it, then assembles fits from the shoes and pieces already in your closet.",
    },
  ],
};
