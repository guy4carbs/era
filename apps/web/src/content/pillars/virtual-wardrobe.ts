import type { PillarContent } from '../../lib/pillars';

/**
 * Pillar content for `/virtual-wardrobe`. Metadata (title, meta, head keyword,
 * dateModified) is real and SEO-ready; the prose fields are short honest
 * placeholders for a content agent to expand.
 *
 * TODO(content): expand `intro` so its first ~150 words directly answer the head
 * keyword "virtual wardrobe"; flesh out each section; add/refine FAQs. Keep Era's
 * honest boundary — closet digitization (photo/link import), style quiz, Ovi's
 * suggestions from OWNED items. No dollar amounts, no fabricated claims, "join
 * the waitlist" (not "download").
 */
export const virtualWardrobe: PillarContent = {
  slug: 'virtual-wardrobe',
  title: 'Virtual Wardrobe',
  metaTitle: 'Virtual Wardrobe: Your Closet, Digitized',
  metaDescription:
    'A virtual wardrobe is the closet you already own, digitized. See how Era turns your clothes into a searchable digital closet by photo or link.',
  headKeyword: 'virtual wardrobe',
  dateModified: '2026-07-14',
  intro: [
    'A virtual wardrobe is the closet you already own, digitized — every piece photographed or imported by link, then organized so you can see and search everything you have in one place.',
    'Era builds that wardrobe for you, then uses it as the foundation for outfits and daily suggestions from Ovi, your AI stylist.',
  ],
  sections: [
    {
      heading: 'How Era builds your wardrobe',
      paragraphs: [
        'Add a piece by snapping a photo or pasting a product link. Era removes the background and tags each item so it becomes a clean, searchable card in your closet.',
      ],
    },
    {
      heading: 'Why digitize your closet',
      paragraphs: [
        'Seeing everything you own in one place is what makes the rest possible — building outfits, spotting real gaps, and buying less because you finally use what you have.',
      ],
    },
  ],
  faqs: [
    {
      q: 'What is a virtual wardrobe?',
      a: 'A virtual wardrobe is a digital version of the clothes you already own. In Era, each piece is added by photo or link and organized into a searchable closet.',
    },
    {
      q: 'How do I add clothes to my virtual wardrobe?',
      a: 'You can add a piece by taking a photo of it or pasting a product link. Era removes the background and tags it so it lands in your closet ready to style.',
    },
  ],
};
