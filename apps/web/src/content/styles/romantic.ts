import type { StylePageContent } from '../../lib/style-pages';

/**
 * Style content for `/styles/romantic`. Name, keywords, and palette hexes come
 * from `ARCHETYPES` in `@era/core/quiz`. Prose below is the published page copy.
 */
export const romantic: StylePageContent = {
  archetype: 'romantic',
  metaTitle: 'Romantic Style Guide: Palettes & Outfit Ideas',
  metaDescription:
    'A guide to romantic style — soft, flowing, feminine dressing. Its palette, five outfit formulas, and the pieces that quietly complete the wardrobe.',
  dateModified: '2026-07-14',
  intro: [
    'Romantic style is the softest of the archetypes — a wardrobe built on flow, delicacy, and quiet prettiness. Think fabrics that drape and move, gentle floral prints, fine knits, and silhouettes that skim the body rather than cinch it. Nothing here is sharp or severe; the whole mood is tender, feminine, and a little wistful.',
    'It suits anyone who feels most themselves in something with movement — a skirt that shifts as you walk, a blouse with a soft tie at the collar. Romantic dressing rewards small details: a scalloped edge, a covered button, a hem that floats. You need not be delicate yourself to wear it, only drawn to clothes that feel gentle against the day.',
    'Worn well, it feels unhurried. A romantic outfit tends to lower the volume of everything around it, which is why it reads as calm rather than costume — pretty, but never trying too hard to prove it.',
    'Across a real week it flexes further than its reputation suggests: a floral midi and a flat for errands, a silk blouse under tailoring at a desk, a slip dress for dinner. The pieces are quiet enough to repeat and lovely enough that repeating them never feels dull.',
  ],
  paletteNarrative:
    'The palette rests on blush pink and warm cream, grounded by a soft sage green and a powdery blue so it never turns saccharine. Dusty rose and lilac arrive as the deeper notes, lending a touch of wistfulness. Keep the pastels close in tone and let one shade lead; the effect stays gentle instead of sugary.',
  outfitFormulas: [
    {
      name: 'Saturday softness',
      items: ['floral midi dress', 'cropped cardigan', 'ballet flat'],
      note: 'Let the dress move; keep everything else quiet.',
    },
    {
      name: 'Desk-ready',
      items: ['silk blouse', 'tailored trouser', 'pointed low heel'],
      note: 'Tuck the blouse for a softer take on office polish.',
    },
    {
      name: 'Dinner drift',
      items: ['bias slip dress', 'fine-knit wrap', 'strappy sandal'],
      note: 'The wrap keeps a bare dress feeling gentle, not exposed.',
    },
    {
      name: 'First chill',
      items: ['knit dress', 'longline wool coat', 'suede ankle boot'],
      note: 'Layer warm tones so the softness survives the cold.',
    },
    {
      name: 'Slow Sunday',
      items: ['broderie blouse', 'relaxed straight jean', 'mule'],
      note: 'Denim grounds the prettiness without hardening it.',
    },
  ],
  gapGuide: {
    intro:
      'A gap is only worth naming when closing it unlocks outfits you cannot make today — not when it simply adds another pretty thing to the pile. These romantic pieces earn their place by connecting the rest of the wardrobe.',
    gaps: [
      {
        piece: 'A bias-cut slip dress',
        why: 'Stands alone in summer and layers under knits in winter, so one piece carries both evening and everyday.',
      },
      {
        piece: 'A fine-gauge cardigan',
        why: 'Softens a sleeveless dress or blouse without adding stiffness, extending pieces into cooler rooms and seasons.',
      },
      {
        piece: 'A floating midi skirt',
        why: 'Pairs with tucked blouses and plain tees alike, lending movement to tops you already own.',
      },
      {
        piece: 'A pointed low heel',
        why: 'Lifts flowing separates for work or dinner while keeping the overall line soft.',
      },
    ],
  },
  faqs: [
    {
      q: 'What is romantic style?',
      a: 'Romantic style is a soft, feminine look built on flowing, delicate pieces and a gentle pastel palette. It favours drape and movement over structure — floral prints, fine knits, and fabrics that shift as you move — for a mood that reads pretty and calm.',
    },
    {
      q: 'Can romantic style work in a professional setting?',
      a: 'Yes. A silk blouse tucked into tailored trousers, or a fine-knit dress under a structured coat, keeps the softness while meeting a polished dress code. The trick is to pair one flowing piece with something more defined so the outfit still holds a clear line.',
    },
    {
      q: 'Does romantic style have to mean florals?',
      a: 'No. Florals are the shorthand, but the archetype is really about softness and flow. Solid pieces in blush, cream, sage, or dusty blue — in fabrics that drape — read just as romantic without a single print.',
    },
    {
      q: 'How is romantic different from classic style?',
      a: 'Classic is structured, tailored, and heritage-minded; romantic is soft, flowing, and delicate. Where classic relies on crisp lines and neutral polish, romantic relies on movement, gentle colour, and detail. Many wardrobes blend the two — tailoring worn with softer blouses and fabrics.',
    },
    {
      q: 'How do I know if romantic is my style?',
      a: 'Notice what you reach for when you feel most yourself: if it tends to be soft fabrics, movement, and gentle colour, romantic is likely leading. Era’s style quiz walks you through twelve quick choices and returns the archetype that fits, so you build on a real read rather than a guess.',
    },
  ],
};
