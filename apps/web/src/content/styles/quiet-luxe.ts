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
    'Novelty is exactly what it does not chase. The person who dresses this way stopped shopping for the new some time ago and started shopping for keeps. Wearing it feels calm and a little private — you register the weight of a good coat and the drape of a proper trouser before anyone else does. Nothing itches, nothing pulls, nothing needs replacing next year.',
    'The logic is trust rather than assembly. You are not building outfits so much as relying on a handful of pieces you have already proven: a knit that holds its shape through back-to-back meetings, a trouser that reads considered on a Tuesday and correct at dinner, a coat that makes whatever is under it look deliberate. By the time it looks effortless, it very nearly is. The wardrobe just keeps working, season after season, because nothing in it was bought to be current.',
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
      'The pieces below are the ones whose absence you feel every time you dress around them — the coat you keep improvising past, the shoes that would finish two half-formed looks. That is the only kind of gap worth closing: the one already shaping how you get dressed. Anything else is just another good thing you do not need.',
    gaps: [
      {
        piece: 'A well-cut neutral overcoat',
        why: 'Turns three separate cold-weather looks into finished ones and outlasts almost everything worn under it.',
      },
      {
        piece: 'One pair of quality leather shoes',
        why: 'The same pair finishes a tailored weekday and a long-weekend look — exactly what a quiet wardrobe asks of everything in it: more than one job, done without fuss.',
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
