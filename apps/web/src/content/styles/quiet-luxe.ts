import type { StylePageContent } from '../../lib/style-pages';

/**
 * Style content for `/styles/quiet-luxe`. Name, keywords, and palette hexes come
 * from `ARCHETYPES` in `@era/core/quiz` — never duplicated here.
 */
export const quietLuxe: StylePageContent = {
  archetype: 'quiet_luxe',
  metaTitle: 'Quiet Luxe Style: Refined Outfits & Palette',
  metaDescription:
    'Quiet luxe lets fabric and cut do the talking. See the palette, five refined outfit formulas, and the pieces that quietly complete the wardrobe.',
  dateModified: '2026-07-14',
  intro: [
    'Quiet luxe is the art of dressing so that material and construction do the talking. It is understated by design: no logos, no loud prints, no season-chasing — just refined pieces cut well and made from fabrics worth touching. The whole point is that quality reads up close, not across a room.',
    'It tends to suit people who have stopped shopping for novelty and started shopping for keeps. Wearing it feels calm and a little private — you notice the weight of a good coat and the drape of a proper trouser before anyone else does. Nothing itches, nothing pulls, and nothing needs replacing next year, which is rather the point.',
    'Across a normal week it shows up as a small rotation of tactile, timeless staples doing quiet work: a knit that holds its shape through back-to-back meetings, trousers that read as considered on a Tuesday and correct at dinner, a coat that makes everything under it look deliberate. You are not building outfits so much as trusting a handful of very good ones, and the result looks effortless because by then it nearly is. Skip the trends and you skip the churn; the wardrobe simply keeps working, season after season.',
  ],
  paletteNarrative:
    'The backbone is warm — cream and camel warming into a deep taupe-brown and a near-black ink, so the whole palette feels lit from within rather than stark. The two accents, a muted mushroom and a soft sage-grey, are barely-there by design; they add depth without ever raising their voice. Wear the lights and darks together in a single tonal column and let one accent soften the seam between them.',
  outfitFormulas: [
    {
      name: 'Considered weekday',
      items: [
        'fine-gauge merino knit',
        'wool tailored trouser',
        'leather loafer',
        'structured leather tote',
      ],
      note: 'Keep everything in one warm tonal family so it reads as a single thought.',
    },
    {
      name: 'Long weekend',
      items: ['cashmere crewneck', 'straight-leg trouser', 'suede sneaker'],
      note: 'Swap the loafer for suede and the polish drops without the quality dropping.',
    },
    {
      name: 'Dinner reservation',
      items: ['silk column dress', 'fine-gold jewelry', 'sleek leather flat'],
      note: 'One good bracelet is the whole accessory budget.',
    },
    {
      name: 'Cold-weather column',
      items: [
        'camel wool overcoat',
        'ribbed roll-neck',
        'tailored trouser',
        'ankle boot',
      ],
      note: 'Match the boot to the trouser to keep the leg one long, uninterrupted line.',
    },
    {
      name: 'Travel day',
      items: [
        'relaxed knit',
        'wide-leg trouser',
        'soft leather slip-on',
        'oversized scarf',
      ],
      note: 'Comfortable enough for the flight, composed enough for whoever meets you.',
    },
  ],
  gapGuide: {
    intro:
      'A gap is only worth naming when closing it unlocks outfits you cannot currently make — not when it simply adds another option. These are the pieces that tend to do that in a quiet-luxe wardrobe.',
    gaps: [
      {
        piece: 'A well-cut neutral overcoat',
        why: 'Turns three separate cold-weather looks into finished ones and outlasts almost everything worn under it.',
      },
      {
        piece: 'One pair of quality leather shoes',
        why: 'Grounds both the tailored and the off-duty formulas, so a single purchase stretches across the week.',
      },
      {
        piece: 'A fine-gauge knit in a warm neutral',
        why: 'Layers under the coat and stands alone at a desk, bridging the office and weekend rotations.',
      },
      {
        piece: 'A structured leather bag in a core tone',
        why: 'Pulls a tonal outfit together and reads considered without any hardware doing the shouting.',
      },
    ],
  },
  faqs: [
    {
      q: 'What is quiet luxe style?',
      a: 'Quiet luxe is understated dressing that relies on fabric quality and precise cut rather than visible branding. It leans on timeless neutrals and pieces built to last, so the look reads refined up close instead of flashy from afar. Think considered over conspicuous.',
    },
    {
      q: 'Is quiet luxury the same as minimalism?',
      a: 'They overlap but are not identical. Minimalism is about paring down to the essential and keeping lines clean; quiet luxury is about material richness and craft, and it happily embraces texture and warmth a strict minimalist might leave out.',
    },
    {
      q: 'What fabrics define a quiet-luxe wardrobe?',
      a: 'Natural, tactile ones: fine merino and cashmere knits, wool tailoring, silk, and full-grain leather. The tell is how a piece feels and holds its shape, not what label is on it.',
    },
    {
      q: 'How do I build a quiet-luxe wardrobe without overbuying?',
      a: 'The honest route is to buy slowly and only for real gaps. Era can weigh the archetype against what you already own and flag the few pieces that would actually unlock new outfits, so you add with intent instead of accumulating.',
    },
    {
      q: 'Does quiet luxe work on a limited color palette?',
      a: 'Yes — it is arguably built for one. A tight range of warm neutrals means nearly everything combines, which is what makes a small wardrobe feel large and keeps every outfit looking intentional.',
    },
  ],
};
