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
 * The six era-moods offered on the last step of the style quiz — "The era I'm
 * entering". Evocative but wearable; a name you'd actually say out loud.
 */
export type QuizMoodId = 'reset' | 'refined' | 'bold' | 'soft' | 'experimental' | 'effortless';

/** The six mood cards. Kept as a typed map so `eraFor` and the cards agree. */
const QUIZ_MOODS: Record<QuizMoodId, { title: string; tagline: string }> = {
  reset: {
    title: 'The Clean Slate Era',
    tagline: 'Strip it back and start with what actually feels like you.',
  },
  refined: {
    title: 'The Quiet Luxe Era',
    tagline: 'Fewer pieces, better ones, worn with intent.',
  },
  bold: {
    title: 'The Statement Era',
    tagline: 'Dress like you mean it and let the room notice.',
  },
  soft: {
    title: 'The Soft Focus Era',
    tagline: 'Easy layers, gentle color, nothing that fights you.',
  },
  experimental: {
    title: 'The Wild Card Era',
    tagline: 'Break your own rules and see what sticks.',
  },
  effortless: {
    title: 'The Effortless Era',
    tagline: 'Looking considered without thinking about it.',
  },
};

/**
 * The short noun each mood contributes to a starter era's name, fused with the
 * user's archetype: `A ${archetype} ${core}` — e.g. "A Quiet Luxe Clean Slate".
 */
const QUIZ_ERA_CORES: Record<QuizMoodId, string> = {
  reset: 'Clean Slate',
  refined: 'Refinement',
  bold: 'Statement',
  soft: 'Soft Focus',
  experimental: 'Wild Card',
  effortless: 'Uniform',
};

/** One warm, honest line per mood, grounding the era in the user's archetype. */
const QUIZ_ERA_BLURBS: Record<QuizMoodId, (archetype: string) => string> = {
  reset: (a) =>
    `A fresh start with ${a} at the center. I'll clear out the noise and rebuild around the pieces that actually feel like you.`,
  refined: (a) =>
    `${a}, dialed in. Fewer choices, better ones — everything earns its place and nothing has to shout.`,
  bold: (a) =>
    `${a} with the volume up. I'll lean into the pieces that get noticed and help you wear them like you mean it.`,
  soft: (a) =>
    `${a}, made gentler. Easy layers and quiet color for the days you'd rather not fight your clothes.`,
  experimental: (a) =>
    `${a}, off the usual path. I'll bend a few of your rules and keep whatever surprises you in a good way.`,
  effortless: (a) =>
    `${a} on autopilot — a go-to that reads as considered without asking much of you.`,
};

/** Fall back to 'reset' for any mood id we don't recognize. */
const resolveMoodId = (moodId: string): QuizMoodId =>
  (moodId in QUIZ_MOODS ? moodId : 'reset') as QuizMoodId;

/**
 * Plural, title-cased group headings for the closet gallery, keyed by the
 * `item_category` enum. Kept beside the deck so a schema change surfaces here.
 */
const CLOSET_CATEGORY_LABELS: Record<string, string> = {
  top: 'Tops',
  bottom: 'Bottoms',
  dress: 'Dresses',
  outerwear: 'Outerwear',
  shoes: 'Shoes',
  bag: 'Bags',
  hat: 'Hats',
  scarf: 'Scarves',
  watch: 'Watches',
  jewelry: 'Jewelry',
  accessory: 'Accessories',
};

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

  /** The Closet tab — everything the user owns, plus the add-a-piece flow. */
  closet: {
    /** Canonical empty-closet line. Warm, low-effort framing. */
    empty: "Let's get your first pieces in — it takes a minute.",
    /** After the very first item lands in the closet. */
    firstItemAdded: "That's one. Your closet starts here.",
    /** Confirmation that an item was saved. */
    itemSaved: 'Saved to your closet.',

    // --- add a piece: entry → source → upload → process → confirm → save ---

    /** Entry button that starts the add-a-piece flow. */
    addCta: 'Add a piece',
    /** Source-chooser label: pick from the photo library. */
    pickPhoto: 'Choose a photo',
    /** Source-chooser label: open the camera. */
    takePhoto: 'Take a photo',
    /** Short progress line while the photo uploads. */
    uploading: 'Uploading…',
    /**
     * While background removal and vision tagging run. Ovi voice, patient —
     * frames it as her taking a proper look, not a machine crunching.
     */
    processing: "Getting a read on this one — I'll just be a moment.",
    /** Confirm-screen heading when the AI tags landed — a genuine stylist beat. */
    processedTitle: "Here's what I saw.",
    /**
     * Confirm-screen heading when processing failed or was dormant. Honest and
     * warm; owns the miss and never blames the user for the photo.
     */
    manualTitle: "I couldn't quite read this one — mind tagging it for me?",
    /** One-tap confirm on the add-a-piece screen. */
    confirmCta: 'Looks right',
    /** Short chip labels for the editable fields on the confirm screen. */
    fieldLabels: {
      category: 'Category',
      name: 'Name',
      brand: 'Brand',
      colorPrimary: 'Main color',
      colors: 'Colors',
      pattern: 'Pattern',
    },
    /**
     * Placeholder text for an unset field chip — nudges the tap that fills it,
     * e.g. `fieldUnset('Brand')` → "Add brand". Takes the field's own label.
     */
    fieldUnset: (field: string): string => `Add ${field.toLowerCase()}`,
    /**
     * Post-confirm toast when a piece is saved. Pairs with the light-impact
     * haptic — the same small warmth the outfit-save moment gets later.
     */
    saved: "That's one more — nicely done.",
    /** Upload or tagging failed. Honest, no blame, points at a retry. */
    addFailed: "That didn't go through — let's try once more.",
    /** Retry affordance on the add-a-piece flow. */
    retryCta: 'Try again',

    // --- add from a link: paste a product URL, let the server read the page ---

    /** Entry label for adding a piece by pasting a product link. */
    addFromLink: 'Add from a link',
    /** Placeholder in the link field, inviting a product URL. */
    pasteLink: 'Paste a product link…',
    /** Progress line while the server fetches and reads the linked page. */
    importLink: 'Reading that page for you…',
    /**
     * The link import found nothing usable. Honest, never blames the link or
     * the user, and offers the photo path as a way through.
     */
    linkFailed: "I couldn't pull anything from that link — try a photo instead?",
    /** Brief success beat before the confirm screen when a link imports. */
    linkImported: 'Got it — take a look.',

    // --- the closet gallery: search, filter, privacy, detail, archive ---

    /** Placeholder in the gallery search field. */
    searchPlaceholder: 'Search your closet…',
    /** The "All" category chip that clears the filter and shows everything. */
    filterAll: 'All',

    /** Toggle state: this piece is private (only the owner sees it). */
    privacyPrivate: 'Private',
    /** Toggle state: this piece can appear on the owner's public profile. */
    privacyPublic: 'Public',
    /**
     * One-line explanation of what private means. Honest about scope: is_private
     * controls whether the closet surfaces on the *public profile* — it is a
     * forward visibility control, not a retroactive guarantee that a cutout
     * already shared can never be seen (cutouts live in a link-addressable
     * bucket). So we promise "kept off your public profile", not "nobody can
     * ever see this". See the storage backlog before public profiles ship.
     */
    privacyHintPrivate: 'Kept off your public profile — only you see your closet here.',
    /** One-line explanation of what public means — honest about visibility. */
    privacyHintPublic: 'This can show up on your public profile.',

    /**
     * Wear-count line for the detail sheet. Zero reads as an invitation, not a
     * scold; otherwise it counts plainly. `detailWearCount(0)` → "Not worn yet".
     */
    detailWearCount: (n: number): string => (n <= 0 ? 'Not worn yet' : `Worn ${n}×`),
    /**
     * Humanizes where a piece came from for the detail sheet, from its
     * `item.source`. Unknown sources fall back to a plain, honest line.
     */
    detailSource: (source: string): string => {
      switch (source) {
        case 'photo':
          return 'Added from a photo';
        case 'link':
          return 'Added from a link';
        case 'email_import':
          return 'From an email receipt';
        default:
          return 'Added to your closet';
      }
    },

    /** Detail-sheet action: edit this piece's tags. */
    edit: 'Edit',
    /** Detail-sheet action: archive this piece. */
    archive: 'Archive',
    /** Gentle confirm before archiving — frames it as reversible, not deletion. */
    archiveConfirm: "Tuck this away? It leaves your closet but isn't deleted.",
    /** Toast after a piece is archived. */
    archived: 'Tucked away. You can bring it back anytime.',

    /**
     * Empty-gallery title. Warm and inviting — the state that sells the two ways
     * in (a photo or a link). Pairs with {@link strings.closet.emptyBody}.
     */
    emptyTitle: 'Your closet is a blank canvas',
    /**
     * Empty-gallery body. Names both import paths plainly so the two Add
     * affordances make sense at a glance.
     */
    emptyBody: 'Snap a photo of something you own, or paste a link to a piece you love — either way in works.',

    /**
     * Title-cases an item category into a plural group heading for the gallery,
     * from its `item.category`. Covers all eleven enum values; unknown values
     * fall back to a plain "Other" heading so this never renders a raw slug.
     */
    categoryLabel: (category: string): string => CLOSET_CATEGORY_LABELS[category] ?? 'Other',
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

  /**
   * The Design tab — the outfit canvas, saved outfits, and eras. This surface
   * owns building a look from closet pieces, saving it, and grouping outfits
   * into eras. Warm and invitational throughout; the one honest exception is
   * {@link strings.design.deleteConfirm}, which tells the plain truth about a
   * permanent delete (outfits have no archive to fall back on, unlike closet
   * pieces — so here we don't soft-pedal).
   */
  design: {
    /**
     * Design-tab empty title — shown when the user has no outfits yet. Invites
     * the first build; pairs with {@link strings.design.tabEmptyBody}.
     */
    tabEmptyTitle: 'Your first outfit starts here',
    /**
     * Design-tab empty body. Frames building as low-effort play with pieces the
     * user already owns, and points at {@link strings.design.newOutfit}.
     */
    tabEmptyBody: 'Pull a few pieces from your closet and see how they come together.',
    /** CTA that opens the canvas to start a new outfit. */
    newOutfit: 'Build an outfit',

    // --- the canvas: an empty stage, then pieces added from the closet drawer ---

    /** Hint on the empty canvas, before any piece is placed. */
    canvasEmptyHint: 'Add pieces from your closet to start building.',
    /** Opens the bottom drawer of closet pieces to drop onto the canvas. */
    addFromCloset: 'Add pieces',
    /** Placeholder in the closet drawer's search field. */
    drawerSearchPlaceholder: 'Find a piece…',

    // --- saving the look: name it, tag an occasion, save ---

    /** Placeholder for the outfit's name on the save form. */
    outfitNamePlaceholder: 'Name this outfit…',
    /** Placeholder for the occasion field — plain examples, no pressure. */
    occasionPlaceholder: 'Work, weekend, night out…',
    /** Save CTA on the outfit form. */
    saveOutfit: 'Save outfit',
    /** Toast after an outfit saves — a small, warm beat. */
    outfitSaved: "That's a look — saved to your outfits.",
    /** Progress line while the cover is composed and the outfit is saved. */
    saving: 'Putting your look together…',
    /** Optional hint that a saved outfit can be reopened and edited. */
    reopenHint: 'Tap any outfit to open it back up.',
    /**
     * Completion label for the canvas once an outfit is saved. Replaces the
     * pre-save "Cancel" on the top-left button — you've saved, so leaving is
     * "Done", not backing out.
     */
    done: 'Done',

    // --- eras: named chapters that group outfits ---

    /** Heading for the eras list on the Design tab. */
    eraSectionTitle: 'Your eras',
    /** Inline CTA to create a new era. */
    newEra: 'Start an era',
    /** Placeholder for the era's name on the create form. */
    eraTitlePlaceholder: 'Name this era…',
    /** Placeholder for the era's description on the create form. */
    eraDescriptionPlaceholder: "What's this era about?",
    /** Label for adding an outfit to an era. */
    assignToEra: 'Add to an era',
    /** Toast after an era is created. */
    eraCreated: 'Era started.',
    /** Toast after an outfit is added to an era. */
    addedToEra: 'Added to your era.',

    /**
     * Piece-count line for an outfit card, from its item count. Singular at one
     * so a small outfit reads right: `outfitItemCount(1)` → "1 piece".
     */
    outfitItemCount: (n: number): string => `${n} ${n === 1 ? 'piece' : 'pieces'}`,

    /** Detail action: delete this outfit. Unlike archive, this is permanent. */
    deleteOutfit: 'Delete outfit',
    /**
     * Confirm before deleting an outfit. Outfit delete is permanent — there's
     * no archive to bring it back, unlike a closet piece — so this is the one
     * line allowed to, and required to, say so plainly. Honesty over comfort.
     */
    deleteConfirm: "Delete this outfit? This can't be undone.",
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

  /**
   * The style quiz — twelve taps that seed a starter era. Honest about the ask
   * (short, skippable) and clear about what Ovi does with the answers.
   */
  quiz: {
    /** Entry button that launches the style quiz (was a hard-coded literal). */
    entryCta: 'Take the style quiz',
    /** Optional pre-quiz framing card title. */
    introTitle: "Let's find your era",
    /** Sets expectations plainly: short, low-stakes, skippable. */
    introBody:
      'Twelve quick taps, under two minutes. No wrong answers, and you can skip whenever you like.',
    /** Quiz-specific escape hatch — "Not now" energy, in context. */
    skip: 'Skip for now',
    /** Accessible label for the progress indicator. */
    progressLabel: (step: number, total: number): string => `Step ${step} of ${total}`,
    /** The six era-mood cards for the final step ("The era I'm entering"). */
    moods: QUIZ_MOODS,
    /**
     * Composes the starter era shown on the reveal and stored in the profile:
     * fuses the chosen mood with the user's archetype. Unknown mood ids fall
     * back to 'reset' so this never throws on bad input.
     */
    eraFor: (moodId: string, archetypeName: string): { title: string; description: string } => {
      const id = resolveMoodId(moodId);
      return {
        title: `A ${archetypeName} ${QUIZ_ERA_CORES[id]}`,
        description: QUIZ_ERA_BLURBS[id](archetypeName),
      };
    },
    /** Reveal headline. */
    revealTitle: 'Your era begins',
    /** Grounds the reveal: what Ovi does with this, and that it's not a lock-in. */
    revealSubtitle: 'This shapes what I suggest first. You can always change direction later.',
    /** Reveal call to action. */
    revealCta: 'Step in',
  },
} as const;

/** The shape of the full copy deck — for typing consumers and adapters. */
export type OviStrings = typeof strings;
