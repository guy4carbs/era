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
    'It suits people who treat getting dressed as a creative act and want their clothes to say something before they do. Wearing it feels easy and a little playful — roomy silhouettes move with you, a graphic does the talking, and there is always room to swap one loud element for another. Nothing here is precious.',
    'Across a week it flexes with the situation: a graphic tee and relaxed denim with clean sneakers most days, a hoodie layered under a jacket when it cools, a standout pair of trainers to reset a plain fit. The palette can sit muted and let one bright piece pop, or go maximal when the mood asks. The through-line is the footwear and the fit, not any single garment — it is a wardrobe you build by feel, one favorite piece at a time.',
  ],
  paletteNarrative:
    'Streetwear runs on a neutral base — black, mid grey, and a soft off-white — so the loud pieces have room to land. Against that, the accents go deliberately electric: a hot red-orange and a bright yellow, the kind of color meant to be seen from across the street. Keep most of a fit grounded in the neutrals and let a single accent — a sneaker, a graphic, a cap — carry the volume.',
  outfitFormulas: [
    {
      name: 'Everyday fit',
      items: ['graphic tee', 'relaxed straight denim', 'clean chunky sneaker', 'cap'],
      note: 'Neutral clothes, one graphic — let the print and the shoe do the talking.',
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
      'In streetwear a gap is the piece that would open up fits you keep imagining but cannot pull off yet — usually a shoe or a standout layer, rarely another basic. If it does not unlock new outfits, it is just another thing in the pile.',
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
      a: 'Streetwear has moved from trend to a permanent part of how people dress, though its specifics shift constantly. The core — comfortable, expressive, sneaker-led fits — has stayed relevant, so building around fundamentals rather than hype ages better.',
    },
    {
      q: 'How do I know if streetwear is my style?',
      a: "If you build outfits around sneakers and reach for bold, comfortable, expressive pieces, it fits. Era's style quiz sorts you into one of eight archetypes and then assembles looks from what is already in your closet, which is the quickest way to be sure.",
    },
  ],
};
