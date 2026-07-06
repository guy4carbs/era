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

    // --- the chat sheet: the surface where Ovi actually speaks ---

    /** Placeholder in the chat input — invites an open question about the closet. */
    chatPlaceholder: 'Ask me anything about your closet…',
    /**
     * Ovi's opening line when the chat sheet appears. Warmer and more forward
     * than {@link strings.ovi.greeting} — it opens a conversation rather than
     * just saying hello.
     */
    chatOpener: 'What are we putting together?',
    /**
     * The four quick-intent chips above the input. `styleItem` is shown only
     * when a piece is already in context; the other three are always offered.
     */
    intentChips: {
      today: 'What do I wear today?',
      styleFor: 'Style me for…',
      styleItem: 'Style this piece',
      whatsMissing: 'What am I missing?',
    },
    /**
     * Ovi's lead-in when she presents a look. Names the occasion when there is
     * one; falls back to a warm, generic beat when there isn't. Brief either way.
     */
    proposalIntro: (occasion?: string): string =>
      occasion ? `Here's a look for ${occasion}.` : "Here's a look I pulled together.",
    /** Card action that saves the proposed look. */
    outfitAcceptCta: 'Save this look',
    /** Card action that passes on the proposed look — never guilt on reject. */
    outfitRejectCta: 'Not today',
    /** Toast after the user saves a proposed look — pairs with the save. */
    accepted: "Saved to your looks — nice call.",
    /** Toast after the user passes on a look — graceful, no pressure to reconsider. */
    rejected: "All good — I'll come back with another.",
    /** Card action that logs a saved look as worn today — closes the daily loop. */
    woreItCta: 'Wore it today',
    /** Confirmed state once a wear is logged — warm, brief, asks nothing further. */
    woreItConfirmed: 'Logged — nice pick.',
    /**
     * The honest answer to "what am I missing?". Names the thin category and
     * embodies the trust rule: it flags a real gap without ever pushing a
     * purchase — buying stays optional, and building without it is expected.
     */
    gapHonest: (category: string): string =>
      `Your closet's thin on ${category} — worth a look when you're ready, but you can build plenty without it.`,
    /**
     * Shown when there aren't enough pieces to assemble a full look. Honest and
     * encouraging; points back at the closet without blaming a sparse start.
     */
    sparseCloset:
      "There's not quite enough here yet to build a full look — add a few more pieces and I'll have more to work with.",
    /**
     * A short weather-aware lead Ovi can open with, grounding the look in the
     * conditions she styled around. Rounds the temperature to a whole degree.
     */
    weatherLine: (tempC: number, condition: string): string =>
      `It's ${Math.round(tempC)}° and ${condition} — I styled around that.`,
    /** Heading for the Feed's "Today" card. */
    todayTitle: "Today's look",
    /**
     * The Feed "Today" card when the closet can't yet produce a suggestion.
     * Invites the pieces that will unlock a daily look — no scold for an empty start.
     */
    todayEmpty: "Add a few pieces and I'll have a look ready for you here each morning.",

    // --- daily limit reached: the AI cost guardrail, in Ovi's voice ---

    /**
     * Returned by ovi-chat as the `reply` when the user hits their per-day Ovi
     * limit. Ovi speaking, not a cold "429": warms the wall into a natural stop
     * for the day. Acknowledges the work done, reassures nothing is lost, and
     * invites tomorrow without pushing or hinting at a paywall — this is a cost
     * guardrail, so there's nothing to upgrade to, just a good place to pause.
     */
    limitReached:
      "We've styled a lot together today — I'm going to catch my breath and pick this right back up with you tomorrow. Everything's saved, and your closet isn't going anywhere.",
    /**
     * Same beat for the add-a-piece pipeline when a user has processed a lot of
     * pieces in one day. Short; owns the pause, keeps their work safe.
     */
    limitReachedProcessing:
      "You've added a lot of pieces today — let's pick up where we left off tomorrow. Everything so far is saved.",
    /**
     * Same beat for deriving the style profile — rarely hit, so kept brief. Warm,
     * never punitive.
     */
    limitReachedProfile: "I've learned plenty about your style today — let's let it settle and refine tomorrow.",

    // --- global AI brake (B3): app-wide kill-switch / daily spend cap, not per-user ---

    /**
     * Returned by ovi-chat (200, source `paused`) when the GLOBAL AI brake is
     * engaged — the app-wide kill-switch or the day's global spend cap, which are
     * operator controls, not a per-user limit. Ovi steps back for everyone,
     * briefly and without alarm: no outfit, no paywall, no talk of errors — just a
     * natural "back shortly". It renders as a normal Ovi turn, so it must read like
     * her, not like an outage banner.
     */
    resting:
      "I'm taking a short breather just now — give me a little while and I'll be right back to style with you. Nothing's lost.",
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

  /**
   * The Shop tab — gap-driven affiliate suggestions, honest by default. This is
   * the trust rule made visible: Shop is not a feed to scroll but a short list
   * of pieces that fill a real gap Ovi found in the closet. The `why` lines
   * below render Ovi's reasoning on each product (from Oracle's ProductWhy), and
   * {@link strings.shop.affiliateDisclosure} tells the plain truth about the
   * commission so ranking-on-payouts is ruled out where the user can read it.
   */
  shop: {
    /** Tab title. */
    title: 'Shop',
    /**
     * Sets the trust frame the moment the tab opens: this is gap-driven, not a
     * scroll. Read together with {@link strings.shop.empty}.
     */
    intro: 'Era shows you pieces that fill a real gap — not a feed to scroll.',
    /**
     * Empty shop surface — mirrors the trust rule: buy only for a real gap.
     * Kept verbatim from the original stub so the promise never drifts.
     */
    empty: "Nothing to shop yet. When a real gap shows up, I'll bring a few picks here.",
    /** Progress line while picks are ranked — frames it as gap-finding, not a feed load. */
    loading: 'Finding pieces that actually fill a gap…',
    /** Load failure. Owns the miss, no blame, points at a retry. */
    error: "Couldn't pull picks just now — try again in a moment.",

    // --- filters: narrow the picks without turning Shop into a catalog ---

    /** Price/budget filter label. */
    filterBudget: 'Budget',
    /** Brand-tier filter label. */
    filterBrandTier: 'Brand tier',
    /** Category filter label. */
    filterCategory: 'Category',
    /** Size filter label. */
    filterSize: 'Size',
    /** Friendly labels for the four brand tiers, keyed by the feed's tier enum. */
    brandTiers: {
      luxury: 'Luxury',
      premium: 'Premium',
      contemporary: 'Contemporary',
      'high-street': 'High street',
    },
    /** Clears every active filter and shows all picks again. */
    clearFilters: 'Clear filters',
    /**
     * Sort/relevance label. Default order is how well a piece fits the closet —
     * named plainly so the ranking stays legible (and honest: closet, not payout).
     */
    sortRelevance: 'Best fit for your closet',

    // --- the 'why' lines: Ovi's honest reason each pick is shown ---

    /**
     * Renders Oracle's `completes_outfits{count}` — the pick's strongest honest
     * pull: it unlocks looks from pieces the user already owns. Singular at one.
     */
    whyCompletesOutfits: (count: number): string =>
      count === 1
        ? 'Completes an outfit with what you own'
        : `Completes ${count} outfits with what you own`,
    /**
     * Renders Oracle's `fills_gap{category}` — names the thin category so the
     * reason is concrete. The trust rule in one line: a real gap, not a nudge.
     */
    whyFillsGap: (category: string): string => `Fills a real gap — you're thin on ${category}`,
    /**
     * Renders Oracle's `similar_owned{ownedCount}` — the honest WARNING, not a
     * push. When the closet already holds something close, Shop says so rather
     * than selling over it. Singular at one; this is the trust rule at work.
     */
    whySimilarOwned: (count: number): string =>
      count === 1
        ? "Heads up — you already own something similar"
        : `Heads up — you already own ${count} similar pieces`,

    // --- affiliate transparency + click-out ---

    /**
     * FTC-honest, trust-preserving affiliate disclosure. Renders visibly in the
     * Shop UI (Shield/Ledger check for it): states the commission plainly AND
     * that it never changes what Ovi shows — ranking is on the closet, not payouts.
     */
    affiliateDisclosure:
      'Era may earn a commission if you buy through these links. It never changes what we show you — Ovi ranks on your closet, not on payouts.',
    /** Click-out affordance to the retailer, e.g. `viewAt('Ssense')` → "View at Ssense". */
    viewAt: (retailer: string): string => `View at ${retailer}`,
    /** Dismiss a pick — the anti-pushy way out, never guilt on decline. */
    dismiss: 'Not for me',
    /** Pull the next page of picks — quiet, not an urgent "keep scrolling". */
    loadMore: 'Show more',

    // --- wishlist: save a pick to come back to, and the Saved view ---

    /**
     * Save/wishlist affordances on a pick. `save`/`saved` are the visible states
     * of the heart toggle; the `*A11y` labels name the action for screen readers
     * (a heart alone doesn't say what a tap does). No urgency — saving is just a
     * quiet "keep this in view", never a step toward buying.
     */
    saved: {
      /** Toggle label, unsaved state. */
      save: 'Save',
      /** Accessible label for the unsaved heart — names the action, not the icon. */
      saveA11y: 'Save to wishlist',
      /** Toggle label, saved state. */
      savedState: 'Saved',
      /** Accessible label for the saved heart — a tap here removes it. */
      removeA11y: 'Remove from wishlist',
      /** Segment/tab label in the Shop header that opens the saved view. */
      tab: 'Saved',
      /** One-line intro atop the Saved view — no pressure, they'll keep. */
      intro: "Pieces you've kept an eye on. No rush — they'll wait here.",
      /**
       * Empty Saved view. Warm and concrete: names the gesture that fills it so
       * the empty state teaches the feature instead of scolding a blank list.
       */
      empty: 'Nothing saved yet — tap the heart on a piece to keep it here.',
    },

    // --- why detail: Ovi's reasoning, grounded in the user's OWN closet ---

    /**
     * The "why" detail sheet templates. Where the short {@link strings.shop.why*}
     * lines fit on a card, these expand the reason against specific pieces the
     * user already owns — so the reasoning is checkable, not a black box. Ovi
     * voice; each returns a finished line the ranker fills with a real item.
     */
    whyDetail: {
      /** Sheet title — frames what follows as Ovi's reasoning, plainly. */
      title: 'Why Ovi picked this',
      /**
       * The pick unlocks a look with a piece already in the closet — named, so
       * the pull is concrete. `completesWith('navy blazer')`.
       */
      completesWith: (itemLabel: string): string => `Completes a look with your ${itemLabel}.`,
      /**
       * The honest "maybe don't buy" signal, surfaced not hidden: the closet
       * already holds something close, and Ovi says which. `similarTo('white
       * sneakers')`. Gentle, never a scold — this is a feature.
       */
      similarTo: (itemLabel: string): string =>
        `You already own something similar — your ${itemLabel}.`,
      /**
       * Names a real gap by category and how little of it the closet holds.
       * Handles an empty category (ownedCount 0) without an awkward "0 ...".
       * `fillsGap('shoes', 0)` / `fillsGap('bags', 2)`.
       */
      fillsGap: (category: string, ownedCount: number): string =>
        ownedCount <= 0
          ? `Fills a real gap — you don't own any ${category} yet.`
          : `Fills a real gap — you own just ${ownedCount} ${category} right now.`,
      /**
       * The pick sits inside colors the user already wears. Optionally names the
       * palette when the ranker has it. `paletteMatch()` / `paletteMatch('warm
       * neutrals')`.
       */
      paletteMatch: (colors?: string): string =>
        colors ? `Matches your palette — the ${colors} you reach for.` : 'Matches your palette.',
    },

    /**
     * Price-drop alerts — the honest way Shop follows up. These fire ONLY on a
     * piece the user chose to save (see {@link strings.shop.saved}), never on
     * something they merely browsed. The voice stays Era's: name the exact piece
     * they saved, state old→new price plainly, and never manufacture urgency —
     * no countdowns, no "BUY NOW", no "last chance". Every surface below leaves
     * a piece easy to skip. Prices arrive already formatted (e.g. "$120") so a
     * currency change never rewrites this copy.
     */
    priceAlerts: {
      /**
       * The transactional email. Reminds them it's a piece THEY saved, states
       * the drop plainly, and closes on a click-out — warm, quiet, no pressure.
       */
      email: {
        /**
         * Subject line — names the exact saved piece and the new price, nothing
         * more. `priceDropSubject('Dries linen shirt', '$96')`.
         */
        subject: (title: string, newPrice: string): string =>
          `The ${title} you saved dropped to ${newPrice}`,
        /** Warm opening line — grounds the note in their own save, not a sale. */
        intro: 'A piece you saved is a little cheaper today.',
        /**
         * The plain old→new price line, naming the piece so it's unmistakable.
         * `priceDropBody('Dries linen shirt', '$120', '$96')`.
         */
        body: (title: string, oldPrice: string, newPrice: string): string =>
          `The ${title} you saved dropped from ${oldPrice} to ${newPrice}.`,
        /** The one honest line — no urgency, still tied to the closet, easy to skip. */
        honest:
          "No countdown, no pressure — if it still fills a gap in your closet, it'll be here when you want it.",
        /**
         * The click-out CTA line to the retailer. Mirrors {@link strings.shop.viewAt}.
         * `priceDropEmailCta('Ssense')` → "View at Ssense".
         */
        cta: (retailer: string): string => `View at ${retailer}`,
      },

      /**
       * The in-app "price dropped" card that surfaces in Shop. A quiet heads-up,
       * not a banner — one line of fact, a way in, and a way out.
       */
      card: {
        /** Card heading — states what happened, plainly. */
        title: 'Price dropped',
        /**
         * One-line body naming the saved piece and the drop.
         * `priceDropCard('Dries linen shirt', '$120', '$96')`.
         */
        body: (title: string, oldPrice: string, newPrice: string): string =>
          `The ${title} you saved dropped from ${oldPrice} to ${newPrice}.`,
        /** Dismiss the card — the anti-pushy way out, no guilt. */
        dismiss: 'Dismiss',
        /** Take a look at the piece — quiet, not urgent. */
        view: 'Take a look',
      },

      /**
       * The push notification — terse by nature, so this is the tightest surface.
       * Still no urgency: names the piece and the new price, and stops there.
       */
      push: {
        /** Push title — short, names the piece. `priceDropPushTitle('Dries linen shirt')`. */
        title: (title: string): string => `${title} dropped in price`,
        /**
         * Push body — the piece they saved, now at the new price.
         * `priceDropPush('Dries linen shirt', '$96')`.
         */
        body: (title: string, newPrice: string): string =>
          `The ${title} you saved is now ${newPrice}.`,
      },
    },
  },

  /**
   * Transactional emails sent by the server (via Resend). One block per email,
   * each with a subject and a short warm body. These are Era's own voice, not a
   * sales channel — no fake urgency, no dark patterns, and a plain, honest note
   * at every turn. Where a value is interpolated (a name, a link) the leaf is a
   * tiny pure function; the rest are plain strings. Pairs with the price-drop
   * email under {@link strings.shop.priceAlerts.email}, the same restrained tone.
   */
  emails: {
    /**
     * Welcome — sent on first sign-in. Warm and brief: says hello, points at the
     * one thing worth doing first (start a closet / meet Ovi), and offers a
     * single way in. Not salesy; the app sells itself once they're inside.
     */
    welcome: {
      /** Subject — warm, plain, no exclamation. */
      subject: 'Welcome to Era',
      /**
       * Body — greets by name and names the first move. `body('Guy')`. Keeps the
       * ask to one thing so the CTA is obvious.
       */
      body: (name: string): string =>
        `Hi ${name} — you're in. Start by adding a few pieces you already own, and Ovi, your stylist, will begin building looks from your closet.`,
      /** The single CTA — opens the app at the link passed in. */
      cta: 'Open Era',
    },

    /**
     * Waitlist confirmation — sent when someone joins the pre-launch waitlist.
     * Confirms the spot, sets the early-access expectation, and mirrors the
     * landing FAQ's pricing honesty ({@link strings.site.faq}). No CTA beyond a
     * quiet "we'll be in touch"; nothing to do yet, and we don't pretend there is.
     */
    waitlist: {
      /** Subject — states the fact plainly. */
      subject: "You're on the Era waitlist",
      /** Body — confirms the spot and sets honest expectations. */
      body:
        "Thanks for joining the Era waitlist. We're in early access and letting people in a few at a time, so it may be a little while. When it's your turn, this is the address we'll use.",
      /** The pricing-honesty line — mirrors the landing FAQ, no false hype. */
      pricingNote:
        "Joining is free, and we'll share pricing openly before anyone is ever charged.",
      /** Closing beat — quiet, no CTA. */
      closer: "We'll be in touch.",
    },

    /**
     * Account-deletion confirmation — sent after an account is deleted. Confirms
     * the deletion is real and permanent (matches the in-app promise at
     * {@link strings.settings.deleteBody}), leaves a genuine, guilt-free door
     * open, and never tries to win them back. Honesty over retention.
     */
    deletion: {
      /** Subject — plain and final. */
      subject: 'Your Era account has been deleted',
      /**
       * Body — confirms the account, closet, and images are permanently gone.
       * Matches the app's real-deletion promise; no euphemism, no hedging.
       */
      body:
        "Your Era account is gone for good. Your closet, your images, and your data have been permanently deleted — there's nothing left on our end to recover.",
      /** The warm, no-pressure open door — welcome back, never a win-back guilt. */
      closer: "If you ever want to start fresh, you're always welcome back.",
    },
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
   * Settings — the account + preferences screen reached from the closet header.
   * Groups appearance, closet visibility, support/legal links, and the two
   * account-exit actions. The delete-account copy is deliberately plain about
   * irreversibility (an App Store requirement and the right-to-erasure) — no
   * euphemism, no blame, and never a hidden default.
   */
  settings: {
    /** Screen title, shown in the stack header. */
    title: 'Settings',

    /** Appearance section heading + the three theme choices. */
    appearance: 'Appearance',
    themeSystem: 'System',
    themeLight: 'Light',
    themeDark: 'Dark',

    /** Closet-visibility section heading (the toggle mirrors profiles.is_private). */
    privacyTitle: 'Closet privacy',

    /** Support + legal section heading and its outbound rows. */
    support: 'Support',
    contactSupport: 'Contact support',
    privacyPolicy: 'Privacy Policy',
    terms: 'Terms of Service',

    /**
     * Price-drop alerts — opt-IN by design, off until the user turns it on. The
     * copy is deliberately plain about scope (only saved pieces are watched) and
     * never dark-patterns the toggle: no pre-checked default, no "recommended"
     * nudge. Pairs with {@link strings.shop.priceAlerts}, which sends them.
     */
    priceAlerts: {
      /** Section heading. */
      title: 'Price-drop alerts',
      /** Plain opt-in explanation — states the default (off) honestly. */
      explain:
        "We'll let you know when a piece you saved drops in price. Off until you turn it on.",
      /** The master toggle label. */
      toggle: 'Price-drop alerts',
      /** Channel row: alert by email. */
      channelEmail: 'Email',
      /** Channel row: alert by push notification. */
      channelPush: 'Push notifications',
      /** Honest scope note under the toggle — we watch only what they saved. */
      savedOnlyNote: "We only watch prices on pieces you've saved — nothing else.",
    },

    /** Account section heading + the sign-out row. */
    account: 'Account',
    signOut: 'Sign out',

    /** Delete-account row label — destructive, never euphemised. */
    deleteAccount: 'Delete account',
    /** Confirmation-sheet title. */
    deleteTitle: 'Delete your account?',
    /** The plain truth about what deletion does — irreversible and total. */
    deleteBody:
      "This permanently deletes your account, closet, and all images. This can't be undone.",
    /** Instruction above the typed-confirmation field, naming the account email. */
    deleteConfirmPrompt: (email: string): string => `Type ${email} to confirm.`,
    /** Placeholder in the typed-confirmation field. */
    deleteConfirmPlaceholder: 'your email',
    /** The destructive confirm button (enabled only when the typed email matches). */
    deleteConfirmCta: 'Delete my account',
    /** Inline error when the typed value doesn't match the account email. */
    deleteMismatch: "That doesn't match your account email.",
    /** While the deletion request is in flight. */
    deleting: 'Deleting your account…',
    /** Brief success state before the app returns to sign-in. */
    deleted: 'Your account was deleted.',
    /** Deletion failed server-side — do NOT sign out; invite a retry. */
    deleteFailed: 'Something went wrong — please try again.',
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

  /**
   * The marketing site — the pre-launch landing page and waitlist. This is the
   * one surface written in Era's *brand* register, not Ovi's stylist voice:
   * the copy below is LOCKED, approved brand copy and must ship verbatim, so
   * the product voice-lint (which polices Ovi's chat tone) does not apply here.
   * It happens to pass those lints anyway — no hype words, no exclamation marks
   * — so the deck-wide lint stays exhaustive and needs no exclusion. If a
   * future edit to this deck ever trips a product-voice rule, scope the lint to
   * exclude `strings.site` rather than reword this approved copy.
   *
   * `sections` is an ordered array of {@link MarketingSection} so the page can
   * `.map` it straight onto the scroll; everything else is a flat leaf string.
   */
  site: {
    /** Above-the-fold hero: the promise, the elaboration, the single CTA. */
    hero: {
      title: 'Getting dressed should be easy.',
      sub: "Era turns the closet you already own into outfits you'll actually wear — with Ovi, your AI stylist, by your side.",
      cta: 'Join the waitlist',
    },
    /**
     * The four value sections, in scroll order. Kept as a tuple so the page
     * renders them with a single `.map` and the order is the source of truth.
     */
    sections: [
      {
        title: 'Your closet, reborn',
        body: 'Every piece you own, rendered as a beautiful virtual wardrobe.',
      },
      {
        title: 'Meet Ovi',
        body: 'The stylist who knows your closet, your style, and your weather — and tells you when NOT to buy.',
      },
      {
        title: 'Enter your era',
        body: "Name the style chapter you're in and dress for it.",
      },
      {
        title: 'Shop everything, buy less',
        body: 'Every brand in one place, recommended only when nothing you own fills the gap.',
      },
    ],
    /** Closing beat before the final waitlist form — the promise, restated. */
    closer: {
      title: "The easiest thing you'll wear all day.",
    },
    /** The waitlist capture form: input placeholder, submit, success beat. */
    form: {
      emailPlaceholder: 'you@email.com',
      cta: 'Join the waitlist',
      /** Warm, quiet confirmation once the email lands — no exclamation. */
      success: "You're on the list.",
    },
    /** Post-signup referral nudge — skip the line by inviting a friend. */
    referral: {
      line: 'Skip the line — invite a friend.',
      cta: 'Copy invite link',
    },
    /** Open Graph tags for shared links — concise, on-brand, mirrors the hero. */
    og: {
      title: 'Era — Getting dressed should be easy.',
      description:
        "The closet you already own, turned into outfits you'll actually wear — with Ovi, your AI stylist by your side.",
    },
    /** The SEO meta description — one honest sentence, kept under ~155 chars. */
    meta: {
      description:
        "Era is a virtual wardrobe and AI stylist. Turn the closet you own into outfits you'll actually wear, and buy only what fills a real gap.",
    },
    /**
     * Entity descriptions for JSON-LD structured data (Organization +
     * SoftwareApplication). Kept ≤ ~160 chars each so they render cleanly in
     * schema, and kept consistent with the locked {@link meta} description so
     * search engines and AI assistants describe Era the same way everywhere.
     */
    seo: {
      /** One-sentence definition of Era the product/company, for Organization JSON-LD. */
      organizationDescription:
        "Era is a virtual wardrobe and AI stylist that turns the closet you already own into outfits you'll actually wear.",
      /** One-sentence definition of the app, for SoftwareApplication JSON-LD. */
      appDescription:
        'A virtual wardrobe and AI stylist: turn the closet you own into outfits, and buy new only to fill a real gap.',
    },
    /**
     * The landing FAQ — five plain, honest Q&As that also feed FAQPage schema.
     * Each answer is written to stand alone so a crawler or AI assistant can
     * quote it directly and describe Era correctly. Consistent entity naming:
     * Era is the app; Ovi is the AI stylist. Kept within the voice-lint budget
     * (no hype, no fake urgency, no exclamation marks).
     */
    faq: [
      {
        q: 'What is Era?',
        a: "Era is a virtual wardrobe and AI stylist. It turns the clothes you already own into a beautiful digital closet, then builds outfits you'll actually wear.",
      },
      {
        q: 'Who is Ovi?',
        a: 'Ovi is your AI stylist inside Era. She knows your closet, your style, and your local weather, and suggests outfits from pieces you already own.',
      },
      {
        q: 'Does Era cost anything?',
        a: "Era is in early access, and joining the waitlist is free. We'll share pricing openly before anyone is ever charged.",
      },
      {
        q: 'Do I have to buy new clothes?',
        a: 'No. Era starts with the closet you already own, and Ovi recommends buying only when nothing you have fills a real gap — she tells you when not to buy.',
      },
      {
        q: 'Is my closet private?',
        a: 'Yes. Your closet is private by default and visible only to you unless you choose to share it. You can delete your account and data whenever you like.',
      },
    ],
  },
} as const;

/** The shape of the full copy deck — for typing consumers and adapters. */
export type OviStrings = typeof strings;

/** The marketing/site copy deck — the landing page's single source of truth. */
export type SiteStrings = OviStrings['site'];

/** One titled marketing section on the landing page (an entry in `site.sections`). */
export type MarketingSection = SiteStrings['sections'][number];

/** Entity descriptions for JSON-LD (Organization + SoftwareApplication). */
export type SiteSeo = SiteStrings['seo'];

/** One landing-FAQ Q&A — an entry in `site.faq`, also the source for FAQPage schema. */
export type SiteFaqEntry = SiteStrings['faq'][number];
