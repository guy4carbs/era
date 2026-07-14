import type { PillarContent } from '../../lib/pillars';

/**
 * Pillar content for `/ai-stylist`. The intro answers the head keyword
 * "ai stylist" as a definition; the sections and FAQs stay honest about Ovi —
 * she styles only from items the user owns, is weather-aware, and suggests buying
 * only to fill a genuine gap.
 */
export const aiStylist: PillarContent = {
  slug: 'ai-stylist',
  title: 'AI Stylist',
  metaTitle: 'AI Stylist: Outfits From Clothes You Own',
  metaDescription:
    'An AI stylist builds outfits from the clothes you already own. Meet Ovi — Era’s AI stylist that suggests looks and tells you when not to buy.',
  headKeyword: 'ai stylist',
  dateModified: '2026-07-14',
  intro: [
    'An AI stylist is software that learns your taste and puts together outfits for you, the way a personal stylist would — but at the speed of an app and available every morning. It reads your style, looks at what you have, and proposes something to wear, so getting dressed becomes a decision you approve rather than one you agonize over.',
    'What separates a genuinely useful AI stylist from a shopping feed dressed up as advice is where the clothes come from. A stylist that only ever points you toward things to buy is a storefront. A real one works with your closet first.',
    'That is how Ovi, Era’s AI stylist, works. She learns your taste from a short style quiz, styles you from the pieces you already own, factors in the day’s weather, and only mentions buying something when there is a gap your closet genuinely cannot fill. Every suggestion is something you can wear today.',
  ],
  sections: [
    {
      heading: 'What an AI stylist actually is',
      paragraphs: [
        'A human stylist does three things: they learn who you are and how you like to dress, they take stock of what you already own, and they assemble outfits that fit the occasion. An AI stylist automates that loop so it can happen daily instead of once in a while.',
        'The value is not novelty for its own sake. It is that the friction of getting dressed drops. When something has already thought about the weather and your closet before you open your eyes, the morning question becomes yes or no rather than a search.',
      ],
    },
    {
      heading: 'How Ovi learns your taste',
      paragraphs: [
        'Ovi starts with a twelve-step style quiz. Your answers place you among eight style archetypes, each with its own palette and sensibility, and that profile becomes her first read on how you like to dress.',
        'The quiz is a starting point, not the final word. As you accept, tweak, or skip her suggestions, and as you log what you actually wear, her sense of your taste sharpens. A profile describes you in broad strokes; your real behaviour fills in the detail.',
      ],
    },
    {
      heading: 'What she does each day',
      paragraphs: [
        'Each day Ovi looks at your local weather and your closet and proposes an outfit built entirely from pieces you own. You can accept it, adjust a piece, or skip it, and every one of those responses tells her a little more.',
        'Because she draws only from your digitized wardrobe, nothing she suggests is aspirational. There is no outfit you cannot assemble because it lives in a store rather than your closet. The suggestion is always wearable, which is the whole point of asking.',
      ],
    },
    {
      heading: 'The trust rule: styling first, buying last',
      paragraphs: [
        'Ovi’s default is to use what you already have. She is not trying to grow your closet; she is trying to get more out of it. Most days that means an outfit assembled from pieces you forgot you owned.',
        'She suggests buying something only when there is a real gap — a genuine hole that nothing in your closet can fill for what you need. She will not upsell a piece you can already make an outfit from, and she will not manufacture a reason to shop. When the honest answer is that you have what you need, that is what she says.',
      ],
    },
    {
      heading: 'What AI styling cannot do',
      paragraphs: [
        'An AI stylist is a tool, not a taste oracle. Ovi can only style from what she can see, so a closet that is half-digitized gives her half a picture. The more of your wardrobe you add, the better her suggestions get.',
        'She also will not override you. If you love a combination she would not have chosen, that is information, not a mistake — and she learns from it. She is meant to reduce the friction of getting dressed and help you see your own clothes more clearly, not to dictate how you look.',
      ],
    },
  ],
  faqs: [
    {
      q: 'What does an AI stylist do?',
      a: 'An AI stylist learns your taste, takes stock of the clothes you own, and assembles outfits for you. In Era, Ovi does this daily — she reads your style profile, checks the weather, and proposes a look built from pieces already in your closet.',
    },
    {
      q: 'How does an AI stylist work?',
      a: 'It starts by learning how you like to dress, in Era through a twelve-step style quiz, then draws on a digital copy of your wardrobe to build outfits. Ovi refines her sense of your taste as you accept, adjust, or skip her suggestions and log what you wear.',
    },
    {
      q: 'Does Ovi make me buy new clothes?',
      a: 'No. Ovi styles you from your existing closet first and suggests a purchase only when there is a genuine gap nothing you own can fill. She will not upsell a piece you can already make an outfit from.',
    },
    {
      q: 'Can an AI stylist replace a human stylist?',
      a: 'It replaces the daily friction of getting dressed, not the human relationship. Ovi is fast, available every morning, and works from your real closet, but she styles from what she can see and learns from your choices rather than dictating them.',
    },
    {
      q: 'Does the AI stylist consider the weather?',
      a: 'Yes. Ovi factors in your local weather when she proposes the day’s outfit, so the suggestion suits the conditions you are actually walking into rather than the season in the abstract.',
    },
  ],
};
