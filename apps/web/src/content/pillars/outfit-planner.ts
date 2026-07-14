import type { PillarContent } from '../../lib/pillars';

/**
 * Pillar content for `/outfit-planner`. Metadata is real and SEO-ready; the prose
 * fields are short honest placeholders for a content agent to expand.
 *
 * TODO(content): expand `intro` so its first ~150 words directly answer the head
 * keyword "outfit planner"; flesh out sections and FAQs. Keep to what Era does —
 * outfit canvas, saved looks, wear logging, Ovi's daily suggestion. No dollar
 * amounts, "join the waitlist" (not "download").
 */
export const outfitPlanner: PillarContent = {
  slug: 'outfit-planner',
  title: 'Outfit Planner',
  metaTitle: 'Outfit Planner: Plan Looks From Your Closet',
  metaDescription:
    'An outfit planner helps you decide what to wear ahead of time. See how Era lets you compose, save, and plan outfits from the closet you own.',
  headKeyword: 'outfit planner',
  dateModified: '2026-07-14',
  intro: [
    'An outfit planner is a place to decide what to wear before you are standing in front of the closet. Era lets you compose looks on a canvas, save them, and plan ahead from the pieces you already own.',
    'Ovi can suggest a look for the day, and wear logging helps you see what you actually reach for.',
  ],
  sections: [
    {
      heading: 'Compose and save looks',
      paragraphs: [
        'Build an outfit on the canvas from your digitized closet, then save it so it is ready when you need it — no more rebuilding the same look each morning.',
      ],
    },
    {
      heading: 'Plan the week',
      paragraphs: [
        'Line up outfits for the days ahead and let Ovi fill the gaps. Planning a few looks in advance turns getting dressed into a two-second decision.',
      ],
    },
  ],
  faqs: [
    {
      q: 'What is an outfit planner?',
      a: 'An outfit planner lets you decide and organize what to wear ahead of time. In Era, you compose looks on a canvas and save them from the clothes you own.',
    },
    {
      q: 'Can I plan a whole week of outfits?',
      a: 'Yes. You can compose and save looks in advance, and Ovi can suggest options for the days ahead so mornings take one decision instead of many.',
    },
  ],
};
