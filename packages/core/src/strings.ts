/**
 * @era/core — Ovi's voice. The single source of user-facing copy.
 *
 * Every string the user reads lives here so the words stay consistent across
 * web and mobile and can be reviewed as one deck. Voice: warm, concise, honest,
 * never pushy. Second person; contractions welcome. Ovi speaks as "I" only in
 * genuine stylist moments. At most one exclamation mark per surface, no fake
 * urgency, no dark patterns — every promotional surface offers a plain way out
 * (see {@link strings.common.notNow}).
 *
 * Dependency-free and platform-free: some leaves are plain strings, others are
 * tiny pure functions that take a value (a city, a weather word) and return a
 * finished line. Import via the `@era/core/strings` subpath.
 */

/**
 * The full copy deck, grouped by surface. `as const` so every leaf is a literal
 * type — callers get autocomplete on the exact strings and can't typo a key.
 */
export const strings = {
  /** Ovi, the AI stylist — the floating button and everything she says. */
  ovi: {
    /** The floating button's accessible label and greeting badge. */
    fabLabel: 'Ovi, your stylist',
    /** Time-neutral greeting shown when Ovi opens. */
    greeting: 'Hey — ready when you are.',
    /** Shown while Ovi is putting a look together. */
    thinking: 'Pulling a look together…',
    /**
     * The lead-in to today's outfit. Weather-aware: names the city and the
     * conditions Ovi styled around, so the suggestion feels grounded.
     */
    dailySuggestionIntro: (city: string, weather: string): string =>
      `${weather} in ${city} today. Here's what I'd wear.`,
    /** After the user accepts today's suggestion. */
    suggestionAccepted: "Good call. I'll remember you liked this.",
    /** After the user passes on a suggestion — graceful, no guilt. */
    suggestionDeclined: "No worries — I'll read the room and try again.",
    /**
     * The trust rule in Ovi's voice: buying is suggested only for a real gap,
     * never over a look the closet can already make.
     */
    shopHonesty:
      "You can already build this from your closet. If a real gap shows up, I'll point it out.",
  },

  /** The Closet tab — everything the user owns. */
  closet: {
    /** Canonical empty-closet line. Warm, low-effort framing. */
    empty: "Let's get your first pieces in — it takes a minute.",
    /** After the very first item lands in the closet. */
    firstItemAdded: "That's one. Your closet starts here.",
    /** Confirmation that an item was saved. */
    itemSaved: 'Saved to your closet.',
    /** While a cutout is being generated for a new item. */
    processing: 'Cleaning up the photo — this takes a moment.',
  },

  /** The Design tab and saved outfits. */
  outfits: {
    /** Pairs with the save haptic when an outfit is saved. */
    saved: 'Outfit saved.',
    /** Empty Design surface — nudge to create, not a scold. */
    emptyDesign: 'Nothing built yet. Pick a few pieces and make something.',
    /** After the user logs that they wore an outfit. */
    wearLogged: 'Logged. Every wear teaches me your taste.',
  },

  /** The Feed tab — looks from people the user follows. */
  feed: {
    /** Empty feed — invitational, not a scold; no fake social pressure. */
    empty: 'Nothing in your feed yet. Follow a few people and their looks land here.',
  },

  /** The Shop tab — gap-driven suggestions, honest by default. */
  shop: {
    /** Empty shop surface — mirrors the trust rule: buy only for a real gap. */
    empty: "Nothing to shop yet. When a real gap shows up, I'll bring a few picks here.",
  },

  /** Authentication surfaces. */
  auth: {
    /** After a magic link is sent. */
    magicLinkSent: 'Magic link sent. Open it to sign in.',
    /** Prompt to go check the inbox. */
    checkEmail: "Check your email — the link's on its way.",
    /** After signing out. */
    signedOut: "You're signed out. See you soon.",
    /** On return for a known user. */
    welcomeBack: 'Welcome back.',
  },

  /** First-run onboarding — picking a username. */
  onboarding: {
    /** Title on the username step. */
    usernameTitle: 'Pick a username',
    /** Prompt under the title. */
    usernamePrompt: "This is how you'll show up on Era.",
    /** When the chosen name is taken — kind, not blaming. */
    usernameTaken: "That one's taken. Try another?",
    /** When the name breaks the rule — plain English, states the rule. */
    usernameInvalid: 'Use 3–20 letters, numbers, or underscores.',
    /** Onboarding complete. */
    done: "You're all set.",
  },

  /** Error and connectivity states — honest, never blaming the user. */
  errors: {
    /** Generic failure. Owns it, no blame, no jargon. */
    generic: 'Something went wrong on our end. Give it another go.',
    /** Offline / no connection. */
    offline: "You're offline. We'll pick up when you're back.",
    /** Retry affordance label. */
    retry: 'Try again',
  },

  /** Shared button and action labels reused across surfaces. */
  common: {
    save: 'Save',
    cancel: 'Cancel',
    continue: 'Continue',
    /** The anti-pushy escape hatch. Every promo surface must offer it. */
    notNow: 'Not now',
  },
} as const;

/** The shape of the full copy deck — for typing consumers and adapters. */
export type OviStrings = typeof strings;
