import type { StylePageContent } from '../../lib/style-pages';

/**
 * Style content for `/styles/classic`. Name, keywords, and palette hexes come
 * from `ARCHETYPES` in `@era/core/quiz` — never duplicated here.
 */
export const classic: StylePageContent = {
  archetype: 'classic',
  metaTitle: 'Classic Style: Tailored Outfits & Palette',
  metaDescription:
    'Classic style is tailored, polished, heritage dressing that lasts for years. See the palette, five outfit formulas, and the anchor pieces worth owning.',
  dateModified: '2026-07-14',
  intro: [
    'Classic style is dressing by the rules that have already survived every trend — tailored shapes, polished finishes, and heritage pieces that looked right decades ago and will look right decades on. It is balanced rather than bold: nothing is exaggerated, nothing is of-the-moment, and everything is proportioned to flatter without drawing a second glance for the wrong reason.',
    'Where a trend-led wardrobe asks you to keep up, this one asks nothing of you — it reads the same in any room and any year. Wearing it feels assured and low-effort: the pieces are familiar, the combinations are settled, and you spend no energy wondering whether an outfit works, because it has worked for a century.',
    'In practice the week runs on a few well-cut anchors traded in and out: a blazer over a shirt for anything that matters, a knit and trouser when it does not, a trench when the weather turns. Denim and a crisp shirt carry the weekend without breaking character. Because each piece is a known quantity, the outfits assemble themselves — polished, proportioned, and quietly permanent. Buy well once, and each piece keeps earning its place in the rotation for years.',
  ],
  paletteNarrative:
    'The classic palette is built on navy and crisp white, with camel warming the middle and a deep burgundy for depth — the colors of blazers, oxford shirts, and good leather. The accents, a forest green and a muted gold, are drawn from the same heritage world and add richness without novelty. Pair navy with white for the cleanest version, then let camel or burgundy carry the seasonal warmth.',
  outfitFormulas: [
    {
      name: 'Boardroom staple',
      items: [
        'navy tailored blazer',
        'white button-down shirt',
        'grey wool trouser',
        'leather oxford',
      ],
      note: 'Navy over white is the outfit that is correct absolutely everywhere.',
    },
    {
      name: 'Smart weekend',
      items: ['camel knit', 'crisp white shirt', 'dark straight jean', 'leather loafer'],
      note: 'A collar under the knit keeps denim on the polished side of casual.',
    },
    {
      name: 'Evening polish',
      items: [
        'tailored navy or burgundy dress',
        'fine-gold jewelry',
        'pointed leather pump',
      ],
      note: 'Let the cut and one heritage accent finish it.',
    },
    {
      name: 'Trench weather',
      items: [
        'classic trench coat',
        'fine knit',
        'tailored trouser',
        'leather ankle boot',
      ],
      note: 'The trench is the piece that makes the rest look intentional in any weather.',
    },
    {
      name: 'Weekend heritage',
      items: ['oxford shirt', 'chino trouser', 'knit blazer', 'suede loafer'],
      note: 'Earth tones and soft tailoring — relaxed but never sloppy.',
    },
  ],
  gapGuide: {
    intro:
      'Run a classic wardrobe through cost-per-wear and the real gaps name themselves: the anchor pieces that would work several times a week, in several roles, for years — never the extra that would hang idle. Close a gap when the piece earns its keep that hard, not when it merely rounds out a collection meant to stay small and complete.',
    gaps: [
      {
        piece: 'A well-tailored navy blazer',
        why: 'Turns shirts and trousers you already own into finished, occasion-ready outfits.',
      },
      {
        piece: 'A crisp white button-down shirt',
        why: 'Underpins nearly every polished look here and doubles as a weekend layer under a knit.',
      },
      {
        piece: 'A classic trench or overcoat',
        why: 'Covers the entire cold-and-wet season without stepping outside the heritage palette.',
      },
      {
        piece: 'One pair of good leather shoes',
        why: 'One considered pair carries the boardroom, the weekend, and everything between; in a wardrobe kept this small, a shoe has to work that hard to belong.',
      },
    ],
  },
  faqs: [
    {
      q: 'What is classic style?',
      a: 'Classic style is a wardrobe of tailored, polished, heritage pieces proportioned for balance rather than trend. It centers on enduring shapes — the blazer, the button-down, the trench, good leather shoes — in a settled palette, so outfits look pulled-together and stay right year after year.',
    },
    {
      q: 'What is the difference between classic and preppy style?',
      a: 'Preppy is a livelier, more collegiate branch of classic — polos, brighter colors, nautical touches. Classic proper is quieter and more tailored, leaning on navy, camel, and neutrals rather than pattern and color. They share a heritage backbone.',
    },
    {
      q: 'Is classic style the same as timeless style?',
      a: 'Nearly. Timeless describes any piece that outlasts trends; classic is the specific aesthetic — tailored, heritage, balanced — that is almost entirely built from timeless pieces. Classic is one reliable way to dress timelessly.',
    },
    {
      q: 'What are the core pieces of a classic wardrobe?',
      a: 'A tailored blazer, a white button-down, well-fitting trousers and dark denim, a knit or two, a trench or overcoat, and good leather shoes. Get those cut well in the heritage palette and most occasions are already covered.',
    },
    {
      q: 'How do I tell if classic is my style?',
      a: "Look at whether your favourite outfits are the tailored, unremarkable ones — the blazer-and-trouser you never think twice about, the shapes you have quietly re-bought for years. A closet that drifts toward navy, camel, and good leather rather than the season's colour is answering for you. Era's quiz picks up those preferences and then styles the anchors you already own.",
    },
  ],
};
