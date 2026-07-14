import type { StylePageContent } from '../../lib/style-pages';

/**
 * Style content for `/styles/athleisure`. Name, keywords, and palette hexes come
 * from `ARCHETYPES` in `@era/core/quiz`. Prose below is the published page copy.
 */
export const athleisure: StylePageContent = {
  archetype: 'athleisure',
  metaTitle: 'Athleisure Style: Sporty Outfits & Palette',
  metaDescription:
    'Athleisure style, done well: sporty, comfortable, sleek. Its clean palette, five outfit formulas, and the pieces that lift gym kit into a real outfit.',
  dateModified: '2026-07-14',
  intro: [
    'Athleisure is sportswear that earns a place outside the gym — comfortable, functional, and sleek enough to wear straight through the day. It borrows the fabrics and shapes of training gear, all stretch, zips, and clean technical lines, then edits out anything that looks like you are mid-workout. Done right, it reads as put-together ease rather than a compromise.',
    'The appeal is immediate the first time you wear it: nothing digs, nothing restricts, and you can move without thinking about your clothes. That comfort is the whole premise — but the archetype only holds together when the pieces are sleek and considered, not whatever was nearest the laundry basket.',
    'Think of the day that never sits still — a school run folding into a commute into back-to-back errands, a workout wedged somewhere in the middle. This is the wardrobe for staying ready to move without looking like readiness is the only thing you dressed for. Function first, but intentional with it.',
    'Everything rides on one thin line — the one between sharp and sloppy. Stay on the right side of it and a fitted tee with joggers reads as put-together, a knit polo with technical trousers passes as smart-casual, a track jacket over leggings looks chosen rather than grabbed. Which side you land on comes down almost entirely to fit and a disciplined palette.',
  ],
  paletteNarrative:
    'The base is deliberately plain: black, white, and a warm greige that keeps the look clean and lets the cut set the tone. Colour enters through the accents only — a fresh mint or a clear cobalt, usually a single flash on a shoe or a zip. Holding the neutrals to one tonal family is what separates sleek athleisure from looking like gym kit.',
  outfitFormulas: [
    {
      name: 'Move-ready default',
      items: ['fitted tee', 'tapered jogger', 'clean low sneaker'],
      note: 'Trim fits keep the comfort from reading as loungewear.',
    },
    {
      name: 'Errand run',
      items: ['zip hoodie', 'legging', 'minimal trainer'],
      note: 'A neat zip layer is what makes leggings look deliberate.',
    },
    {
      name: 'Smart-casual sport',
      items: ['knit polo', 'technical trouser', 'leather sneaker'],
      note: 'Swap the jersey for knit and the outfit dresses up fast.',
    },
    {
      name: 'Cold-weather training',
      items: ['track jacket', 'thermal legging', 'high-top'],
      note: 'Layer for warmth; keep every piece in one colour family.',
    },
    {
      name: 'Recovery day',
      items: ['boxy sweatshirt', 'bike short', 'slide'],
      note: 'Relaxed shapes stay tidy when the palette is disciplined.',
    },
  ],
  gapGuide: {
    intro:
      'Athleisure tempts you into variations on what you have — one more legging, one more tee. The real gap is rarely another of those; it is the single piece that lifts the gym clothes already in your drawer into something that reads as chosen. The test is not whether a buy is nice but whether it makes a look your current kit cannot.',
    gaps: [
      {
        piece: 'One clean, non-technical sneaker',
        why: 'A pared-back trainer bridges workout and street, so the rest of an outfit stops looking gym-only.',
      },
      {
        piece: 'A structured zip layer',
        why: 'A sharp track or bomber-cut jacket frames leggings and joggers as an intentional outfit rather than loungewear.',
      },
      {
        piece: 'A pair of tailored technical trousers',
        why: 'Reads as trousers, wears like sweatpants, and takes athleisure into places joggers cannot go.',
      },
      {
        piece: 'A well-cut neutral tee',
        why: 'A tee that holds its shape lifts every bottom you own above basic gym kit.',
      },
    ],
  },
  faqs: [
    {
      q: 'What is athleisure style?',
      a: 'Athleisure is a sporty, comfortable look built on functional, sleek activewear that works well beyond the gym. It pairs training-inspired pieces — leggings, joggers, technical fabrics, clean sneakers — in fits considered enough to read as a real outfit for everyday wear.',
    },
    {
      q: 'Is athleisure still in style?',
      a: 'Yes. It has settled from a trend into a lasting way of dressing, driven by remote work, active routines, and better-made technical clothing. The specifics shift each season, but comfortable, sporty, put-together dressing is now a fixture rather than a fad.',
    },
    {
      q: 'How do I make athleisure look intentional and not lazy?',
      a: 'Focus on fit and palette. Choose trim, well-cut pieces over baggy ones, keep the neutrals in a single colour family, and add one sharp layer such as a structured jacket. Those small edits are the difference between an outfit and loungewear.',
    },
    {
      q: 'Can you wear athleisure to a casual office?',
      a: 'In a relaxed workplace, yes — a knit polo or clean tee with tailored technical trousers and leather sneakers reads as smart-casual. Keep it to the sleeker end: skip visible logos, worn-in gym pieces, and anything you would sweat in.',
    },
    {
      q: 'What is the difference between athleisure and loungewear?',
      a: 'Loungewear is made to relax in at home; athleisure is made to be seen out in the world. They share comfort, but athleisure holds a sharper fit and a cleaner palette so it works as an outfit rather than something to change out of before leaving.',
    },
  ],
};
