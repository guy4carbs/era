import type { PillarContent } from '../../lib/pillars';

/**
 * Pillar content for `/outfit-planner`. The intro answers the head keyword
 * "outfit planner" as a definition; the sections and FAQs stay inside what Era
 * does — the outfit canvas, saved eras, weather- and calendar-aware planning,
 * wear logging, and buying less as a result.
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
    'An outfit planner is a tool for deciding what to wear before you are standing in front of the closet at the last minute. Instead of improvising each morning, you compose looks ahead of time, save the ones that work, and line them up against the days coming. It turns getting dressed from a daily puzzle into a choice you already made.',
    'The best outfit planners work from the clothes you actually own, not a catalogue of things to buy. A plan built around pieces you do not have is a wish list; a plan built around your real closet is something you can wear on Tuesday.',
    'Era is that kind of planner. You build outfits on a canvas from your digitized wardrobe, save them into named "eras" you can reopen, and plan around the week’s weather and calendar. Ovi, your AI stylist, can suggest looks to fill the days you have not planned, and every piece she uses is one you already own.',
  ],
  sections: [
    {
      heading: 'What an outfit planner is for',
      paragraphs: [
        'The problem an outfit planner solves is decision fatigue at the worst possible time of day. Standing in front of the closet with somewhere to be is when good judgement is hardest and the same three outfits win by default.',
        'Planning moves that decision earlier, to a calmer moment when you can actually think. A look you assembled the night before, or over the weekend for the week ahead, is one less thing to solve when you are half awake and short on time.',
      ],
    },
    {
      heading: 'Planning from what you already own',
      paragraphs: [
        'In Era you build outfits on a canvas, pulling pieces straight from your digitized closet and arranging them into a look. Because the canvas only holds clothes you actually have, nothing you plan is out of reach — no waiting on a delivery to complete an outfit.',
        'Looks you want to keep get saved into "eras", named collections you can reopen whenever you need them. A saved look is a decision you only have to make once; the next time it fits the day, it is already there.',
      ],
    },
    {
      heading: 'The weekly rhythm',
      paragraphs: [
        'Planning a week works best as a short, regular ritual. Look at the days ahead — the weather rolling in, what your calendar holds, which days ask for more and which ask for less — and set looks against them on the canvas.',
        'You do not have to fill every day yourself. Ovi can propose looks for the gaps, weather-aware and drawn from your closet, so planning becomes editing her suggestions rather than starting from a blank slate. A few minutes once a week can cover the mornings that would otherwise cost you time daily.',
      ],
    },
    {
      heading: 'Wear logging and the freedom to repeat',
      paragraphs: [
        'Era lets you log what you actually wear, which quietly shows you the truth about your closet — the pieces you lean on, the ones you never reach for, the looks worth keeping in rotation.',
        'Repeating outfits is not a failure of planning; it is the reward for owning things you love. A good planner does not push relentless novelty. It helps you return to what works and notice when a favourite has earned its place in the rotation.',
      ],
    },
    {
      heading: 'How planning helps you buy less',
      paragraphs: [
        'Most impulse buying happens in the gap between not knowing what to wear and needing to leave. Close that gap with a plan and the urge to shop your way out of it fades.',
        'Planning from a closet you can see also makes real gaps obvious and imaginary ones disappear. You stop buying a piece you already own in another colour, and when something genuinely is missing, you know it — which is exactly when Ovi will say so, and only then.',
      ],
    },
  ],
  faqs: [
    {
      q: 'What is an outfit planner?',
      a: 'An outfit planner is a tool for deciding and organizing what to wear ahead of time. In Era, you compose looks on a canvas from the clothes you own, save them into named collections, and line them up against the days ahead.',
    },
    {
      q: 'What is the best way to plan outfits for a week?',
      a: 'Set aside a few minutes once a week, look at the weather and your calendar for the days ahead, and build a look for each on the canvas. In Era you can let Ovi propose outfits for any days you have not planned, then adjust from there.',
    },
    {
      q: 'Can I reuse outfits I have already planned?',
      a: 'Yes, and you should. Era saves looks into named "eras" you can reopen anytime, so a good outfit is a decision you make once. Wear logging also shows you which combinations you return to most.',
    },
    {
      q: 'Do I need to plan an outfit for every single day?',
      a: 'No. Plan the days you want certainty on and leave the rest open. Ovi can suggest a weather-aware look from your closet on any unplanned day, so partial planning still saves you the hardest morning decisions.',
    },
    {
      q: 'Does planning outfits help me spend less on clothes?',
      a: 'It tends to. Deciding in advance removes the last-minute panic that drives impulse buying, and planning from a closet you can fully see makes real gaps clear and duplicate purchases less likely.',
    },
  ],
};
