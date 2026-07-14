import type { StylePageContent } from '../../lib/style-pages';

/**
 * Style content for `/styles/edgy`. Name, keywords, and palette hexes come from
 * `ARCHETYPES` in `@era/core/quiz`. Prose below is the published page copy.
 */
export const edgy: StylePageContent = {
  archetype: 'edgy',
  metaTitle: 'Edgy Style: Dark Palette & 5 Outfit Formulas',
  metaDescription:
    'Edgy style, explained: dark, sharp, structured dressing. Its moody palette, five outfit formulas, and the anchor pieces the whole look is built on.',
  dateModified: '2026-07-14',
  intro: [
    'Edgy style is dressing with an edge on purpose — dark, sharp, and built to look a little unbothered by convention. It runs on structure and contrast: hard shoulders, clean severe lines, and a palette that stays close to black. People reach for the word rebellious, but the truer one is deliberate.',
    'The mood is moody rather than loud. An edgy outfit does not shout; it holds its ground. Leather, heavy denim, matte hardware, and a boot with real weight do the work, and the result feels controlled even when the individual pieces are aggressive.',
    'It suits people who want their clothes to keep a firm line — who would rather a stiff collar and a heavy sole than anything floaty, and who like a wardrobe that photographs a little dangerous. You do not have to live loudly to dress this way; plenty wear it precisely because it needs no explanation.',
    'Through a week it is more wearable than it looks. All-black separates carry a normal workday, a blazer sharpens a meeting, and the same leather jacket that anchors a night out reads perfectly at ease on a Sunday. The severity is a feature: fewer decisions, and every one of them intentional.',
  ],
  paletteNarrative:
    'Near-black ink and charcoal do the heavy lifting, so the base always reads dark and slightly severe. A deep oxblood keeps it from going flat, adding warmth without brightness. Steel grey softens the edges where you want a little breathing room, and a single hit of crimson is as loud as this palette ever needs to be.',
  outfitFormulas: [
    {
      name: 'Monochrome default',
      items: ['black tee', 'straight black jean', 'leather ankle boot'],
      note: 'One tonal base; let the fit and fabric carry it.',
    },
    {
      name: 'Structured desk',
      items: ['tailored blazer', 'charcoal roll-neck', 'cigarette trouser'],
      note: 'Sharp and covered for rooms that expect a jacket.',
    },
    {
      name: 'After dark',
      items: ['leather trouser', 'sheer long-sleeve', 'heeled boot'],
      note: 'Slick and severe; keep the palette to one deep note.',
    },
    {
      name: 'Cold front',
      items: ['longline wool coat', 'ribbed knit', 'lug-sole boot'],
      note: 'Long, dark lines; weight at the hem grounds the coat.',
    },
    {
      name: 'Low gear',
      items: ['moto jacket', 'band tee', 'ripped denim', 'combat boot'],
      note: 'Undone on purpose — the jacket keeps it intentional.',
    },
  ],
  gapGuide: {
    intro:
      'Era flags a gap only when the missing piece changes what you can wear — the item that turns three orphaned things into outfits. For an edgy wardrobe that is almost always one structural anchor, not more of the same dark basics.',
    gaps: [
      {
        piece: 'A leather or faux-leather jacket',
        why: 'The spine of the whole look. It hardens a plain tee or a soft dress instantly and pulls a dozen combinations together.',
      },
      {
        piece: 'A heavy lug-sole boot',
        why: 'Grounds trousers, denim, and dresses with real weight, so lighter pieces stop reading as delicate.',
      },
      {
        piece: 'A tailored dark blazer',
        why: 'Gives the archetype a sharp, covered option for a workday or a dinner without softening the mood.',
      },
      {
        piece: 'A charcoal roll-neck',
        why: 'Layers under nearly everything and adds a high, severe line without introducing a new colour.',
      },
    ],
  },
  faqs: [
    {
      q: 'What is edgy style?',
      a: 'Edgy style is a dark, sharp, structured look with a rebellious, moody attitude. It is usually anchored in black and built from hard-edged pieces — leather, heavy denim, structured tailoring, and weighty boots — with contrast and severe lines doing most of the work.',
    },
    {
      q: 'Does edgy style have to be all black?',
      a: 'No, though black is the natural centre of gravity. Charcoal, gunmetal grey, and a deep oxblood extend the range while keeping the mood dark, and a single crimson accent adds heat without breaking the palette.',
    },
    {
      q: 'Can you wear edgy style to work?',
      a: 'Yes, in most settings. A tailored blazer over a roll-neck with dark cigarette trousers keeps the sharp, structured feel while reading as office-appropriate. Save the visible hardware and heaviest boots for less formal days.',
    },
    {
      q: 'Is edgy the same as gothic style?',
      a: 'They overlap but are not the same. Gothic leans ornate and theatrical — lace, velvet, dramatic silhouettes. Edgy is more pared-back and structural: clean severe lines, minimal ornament, and modern tailoring rather than costume.',
    },
    {
      q: 'How do I add an edge without overhauling my wardrobe?',
      a: 'Start with one anchor — a leather jacket or a heavy boot — and wear it over pieces you already own. A single structured, dark item shifts a soft or neutral outfit toward edgy without you replacing everything.',
    },
  ],
};
