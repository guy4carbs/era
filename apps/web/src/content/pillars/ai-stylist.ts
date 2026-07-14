import type { PillarContent } from '../../lib/pillars';

/**
 * Pillar content for `/ai-stylist`. Metadata is real and SEO-ready; the prose
 * fields are short honest placeholders for a content agent to expand.
 *
 * TODO(content): expand `intro` so its first ~150 words directly answer the head
 * keyword "ai stylist"; flesh out sections and FAQs. Ovi suggests only from items
 * the user OWNS and tells them when not to buy — never fabricate capabilities. No
 * dollar amounts, "join the waitlist" (not "download").
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
    'An AI stylist is a tool that learns your taste and builds outfits for you. Ovi, Era’s AI stylist, works only from the clothes you already own — so every suggestion is something you can actually wear today.',
    'She knows your style profile, your closet, and your local weather, and she will tell you when nothing new is needed.',
  ],
  sections: [
    {
      heading: 'How Ovi styles you',
      paragraphs: [
        'Ovi reads your style profile from the quiz and pulls from your digitized closet to propose outfits — a daily suggestion you can accept, tweak, or skip.',
      ],
    },
    {
      heading: 'When she tells you not to buy',
      paragraphs: [
        'Ovi recommends buying only when nothing you own fills a real gap. The default is to use what you have, not to sell you more.',
      ],
    },
  ],
  faqs: [
    {
      q: 'What does an AI stylist do?',
      a: 'An AI stylist learns your taste and assembles outfits for you. In Era, Ovi builds looks from the clothes you already own and flags when nothing new is needed.',
    },
    {
      q: 'Does Ovi make me buy new clothes?',
      a: 'No. Ovi styles you from your existing closet first and suggests a purchase only when there is a genuine gap nothing you own can fill.',
    },
  ],
};
