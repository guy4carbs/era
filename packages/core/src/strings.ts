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
 * A lowercased category label for mid-sentence use, drawn from the same map
 * {@link strings.closet.categoryLabel} reads — so 'bottom' → "bottoms" reads
 * naturally inside a gap sentence. Unknown slugs fall back to a plain "pieces".
 */
const categoryLabelLower = (category: string): string =>
  (CLOSET_CATEGORY_LABELS[category] ?? 'pieces').toLowerCase();

/**
 * Joins owned category slugs into a warm, lowercased list — "tops and shoes",
 * "tops, shoes, and bags". Used to name what a gap pairs with, in plain English.
 */
const joinCategoryLabels = (categories: readonly string[] = []): string => {
  const labels = (categories ?? []).map(categoryLabelLower);
  if (labels.length <= 1) return labels.join('');
  if (labels.length === 2) return labels.join(' and ');
  const last = labels[labels.length - 1] as string;
  return `${labels.slice(0, -1).join(', ')}, and ${last}`;
};

/** Outfit count with singular at one: `newOutfits(1)` → "1 new outfit". */
const newOutfits = (n: number): string => `${n} new ${n === 1 ? 'outfit' : 'outfits'}`;

/**
 * Coerce a possibly-untyped count to a finite number, never NaN — the boundary
 * guard the wear helpers share so garbage input renders "0", never "undefined"
 * or "NaN". `safeCount('nope')` → 0, `safeCount(3)` → 3.
 */
const safeCount = (n: unknown): number => {
  const c = Number(n);
  return Number.isFinite(c) ? c : 0;
};

/** Wear count with singular at one: `wearsLabel(1)` → "1 wear", `wearsLabel(3)` → "3 wears". */
const wearsLabel = (n: number): string => `${n} ${n === 1 ? 'wear' : 'wears'}`;

/**
 * Trim an interpolated text value, falling back rather than rendering an empty
 * or non-string slot — so a missing price/label never leaves a dangling "your "
 * or a bare "undefined" in user-facing copy.
 */
const cleanText = (value: unknown, fallback: string): string => {
  const text = typeof value === 'string' ? value.trim() : '';
  return text.length > 0 ? text : fallback;
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

    // --- import a receipt: forward an order email, let the server read it ---

    /**
     * The third add-a-piece path (alongside photo and link): parse an order
     * confirmation email into draft pieces. Lands the same `email_import` source
     * {@link strings.closet.detailSource} already names. Ovi voice — warm, honest
     * about coverage (not every store's receipts are learned yet), never blaming
     * the user or the retailer. The count helper is boundary-hardened via
     * {@link safeCount} (NaN/garbage → 0) so the voice-lint can probe it with any
     * input without a throw, and so a partial/absent count never leaks "undefined".
     */
    importReceipt: {
      /** Entry label for adding pieces by importing a store receipt. */
      entryCta: 'Import a receipt',
      /**
       * Instruction line under the entry. Names the gesture plainly — forward an
       * order email, paste it — and sets the honest expectation that what lands
       * are drafts to check, not finished closet entries.
       */
      instruction:
        "Forward an order confirmation from a store, then paste it here — I'll pull the pieces out and add them as drafts for you to check.",
      /** Placeholder in the paste box, inviting the pasted email. */
      pastePlaceholder: 'Paste your order confirmation email…',
      /** Progress line while the server reads the receipt and pulls out pieces. */
      parsing: 'Reading your receipt — pulling out the pieces.',
      /**
       * Success beat, from the count of pieces parsed. Zero is honest, not a
       * scold: it owns that receipt layouts vary and coverage is still growing,
       * never blaming the user's email. One and many frame the results as drafts
       * to review before they join the closet. `added(0)` / `added(1)` / `added(4)`.
       */
      added: (n: number): string => {
        const c = safeCount(n);
        if (c <= 0)
          return "I couldn't pick any pieces out of that email yet — stores lay their receipts out all sorts of ways, and we're still learning to read them.";
        return c === 1
          ? 'Added 1 piece as a draft — take a look before it joins your closet.'
          : `Added ${c} pieces as drafts — take a look before they join your closet.`;
      },
      /**
       * Shown when the sender's receipts aren't parseable yet. Warm and plain —
       * not apologetic-corporate — and points at the two paths that always work.
       */
      unsupported:
        "I haven't learned this store's receipts yet — for now, a photo or a link will get these pieces in.",
      /** The import didn't go through. Owns the miss, no blame, invites a retry. */
      error: 'Something snagged reading that receipt — give it another go.',
      /**
       * Client-side over-limit line: the pasted email is past the 1MB the server
       * accepts. Warm and actionable — name the fix (trim to just the order email)
       * rather than the byte count, and never blame the user.
       */
      tooLong: "That's a lot to take in at once — trim it down to just the order email and I'll read it.",
    },

    // --- add several at once: one photo of several pieces, split into drafts ---

    /**
     * A batch add-a-piece path: photograph several pieces laid out together and
     * let vision segment them into separate drafts. Same Ovi voice as the single
     * add flow, scaled to a group. The vision-segmentation credential is dormant
     * behind `isRealCredential` (like the single-item vision path {@link
     * strings.closet.manualTitle} falls back on), so {@link
     * strings.closet.bulkCapture.dormant} carries the "waking up soon" beat in
     * Ovi's voice, not an outage banner. Every count helper coerces at the
     * boundary via {@link safeCount} (NaN/garbage → 0) — never a throw, never a
     * leaked "undefined"/"NaN" — so the voice-lint can probe them with any input.
     */
    bulkCapture: {
      /** Entry label for the batch add flow. */
      entryCta: 'Add several at once',
      /**
       * Instruction under the entry — the one thing that makes segmentation work:
       * lay pieces flat with space between them, take a single photo.
       */
      instruction:
        "Lay a few pieces flat with a little space between them and take one photo — I'll pull each one out on its own.",
      /**
       * Progress line while vision segments the photo into pieces. Ovi voice,
       * patient — mirrors the single-item {@link strings.closet.processing}.
       */
      working: "Sorting this photo into separate pieces — I'll just be a moment.",
      /**
       * Batch confirm-screen heading once pieces are pulled out — the group-scale
       * counterpart to the single-item {@link strings.closet.processedTitle}.
       */
      confirmTitle: "Here's what I pulled out.",
      /**
       * The review nudge under the batch title. Trust-the-user framing — an
       * invitation to glance, not an obligation: the web confirm-all button
       * ({@link strings.closet.bulkCapture.confirmRestCta}) doesn't gate each
       * piece, so this offers a fix without demanding one.
       */
      confirmSubtitle: 'Give these a glance — tweak anything I misread.',
      /**
       * The batch confirm-all affordance, shown once at least one piece has been
       * reviewed: confirm every remaining draft as it stands, tags untouched. A
       * short functional label, kin to the single-item {@link
       * strings.closet.confirmCta}.
       */
      confirmRestCta: 'Confirm the rest',
      /**
       * Per-piece a11y position label for the batch review carousel — screen-reader
       * plain: `itemPosition(2, 5)` → "Piece 2 of 5". Both numbers coerce at the
       * boundary so a partial render never reads "undefined of undefined".
       */
      itemPosition: (index: number, total: number): string =>
        `Piece ${safeCount(index)} of ${safeCount(total)}`,
      /**
       * Count of pieces segmented out of the photo. Zero is honest and actionable,
       * not a scold: it names the fix (more space between pieces) rather than
       * blaming the photo. `found(0)` / `found(1)` / `found(4)`.
       */
      found: (n: number): string => {
        const c = safeCount(n);
        if (c <= 0)
          return "I couldn't pick out separate pieces in that photo — try laying them flat with a bit more space between them.";
        return c === 1 ? 'Found 1 piece in your photo.' : `Found ${c} pieces in your photo.`;
      },
      /**
       * Partial-failure line — most pieces processed, a few didn't. Honest about
       * the gap, no blame, and points at the single-item path for the stragglers.
       */
      partialFailure:
        "I added the ones I could read — a few wouldn't process, so they didn't make it in. Add those on their own when you're ready.",
      /**
       * Dormant-credential line: batch vision-segmentation isn't switched on yet.
       * Matches the app's dormant voice — warm, a "coming soon" beat, never an
       * error or "not configured" — and offers the single-add path that works today.
       */
      dormant:
        "Reading several pieces from one photo is something I'm still switching on — it'll be here soon. For now, add them one at a time and I'll tag each one.",
    },

    // --- the closet gallery: search, filter, privacy, detail, archive ---

    /** Placeholder in the gallery search field. */
    searchPlaceholder: 'Search your closet…',
    /** The "All" category chip that clears the filter and shows everything. */
    filterAll: 'All',
    /**
     * A11y label for an unconfirmed draft tile — a piece that landed in the
     * closet with its tags unconfirmed (an add-flow the user backed out of, a
     * receipt import). An accent dot flags it visually; this names the state and
     * the way out for a screen reader. Mobile's tap opens the detail sheet to
     * review and confirm, so it reads "tap to review" (web jumps straight to the
     * confirm screen). `draftTileA11y('Blue oxford shirt')`.
     */
    draftTileA11y: (name: string): string => `${name} — draft, tap to review`,

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
    /**
     * One-line explanation of what public means — honest about the full reach.
     * Public profiles are search-indexed (canonical + sitemap + JSON-LD), so
     * informed consent names that consequence plainly: not just "on your profile"
     * but visible to anyone, search engines included.
     */
    privacyHintPublic: 'This can show up on your public profile — visible to anyone, including search engines.',

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
   * Wear tracking — the loop that turns "I wore this" into something the user can
   * see: per-item stats, a month calendar, and a screenshot-friendly recap. Warm
   * and honest, never a productivity scold — a busy month is celebrated lightly, a
   * quiet one is fine, and cost-per-wear is framed as a piece earning its place,
   * never as guilt over what it cost. Ovi speaks as "I" only where it lands as a
   * genuine stylist beat. The quick-log confirmations here EXTEND the existing wear
   * copy ({@link strings.ovi.woreItConfirmed}, {@link strings.outfits.wearLogged})
   * for the item-level "worn today" tap rather than duplicating it. Every helper is
   * boundary-hardened: counts pass through {@link safeCount} (NaN/garbage → 0) and
   * interpolated text through {@link cleanText} (never a bare "undefined"), so the
   * voice-lint can probe them with any input without a throw.
   */
  wear: {
    // --- item detail: wear count + cost per wear ---

    /**
     * Natural-language wear count for the item-detail stats block — distinct from
     * the terse meta chip {@link strings.closet.detailWearCount} ("Worn 3×"): this
     * reads as a sentence for the stats surface. Singular at one; zero reads as a
     * plain, unpressured "not yet". `count(0)` → "Not worn yet".
     */
    count: (n: number): string => {
      const c = safeCount(n);
      if (c <= 0) return 'Not worn yet';
      return c === 1 ? 'Worn once' : `Worn ${c} times`;
    },
    /**
     * Cost-per-wear line for the stats block. Takes an ALREADY-formatted price
     * string — money formatting lives elsewhere, never here. `costPerWear('$15')`
     * → "$15 per wear". The lower it goes, the more a piece has earned its keep.
     */
    costPerWear: (price: string): string => `${cleanText(price, '—')} per wear`,
    /**
     * Shown in place of cost-per-wear when the purchase price is unknown. A gentle
     * invitation to add it — honest that it's optional, no pressure either way.
     */
    costPerWearUnknown: 'Add what you paid to see your cost per wear.',

    // --- the wear calendar: a month of what got worn ---

    calendar: {
      /** Calendar screen / section title. */
      title: 'Your wear calendar',
      /**
       * Empty-month state — nothing logged for the month in view. Invitational,
       * points back at the "wore it" tap, no scold for a blank month.
       */
      emptyMonth: "Nothing logged this month yet — mark a look as worn and it'll show up here.",
      /**
       * Accessible label for a calendar day, from its wear count. Screen-reader
       * plain: `dayA11y(2)` → "2 wears", `dayA11y(1)` → "1 wear". Zero-hardened for
       * a day that renders without wears; pairs with the visible count badge.
       */
      dayA11y: (n: number): string => {
        const c = safeCount(n);
        return c <= 0 ? 'No wears' : wearsLabel(c);
      },
    },

    // --- monthly recap: the screenshot card ("your month, worn") ---

    recap: {
      /** Recap card title — the card is designed to be screenshotted and shared. */
      title: 'Your month, worn',
      /**
       * The card's date header, from an already-formatted month label. Guarded
       * pass-through so a missing month never renders blank. `monthHeader('July
       * 2026')` → "July 2026".
       */
      monthHeader: (month: string): string => cleanText(month, 'This month'),
      /**
       * Total wears logged across the month. Singular at one; zero reads as a
       * plain, unpressured line. `totalWears(24)` → "You logged 24 wears".
       */
      totalWears: (n: number): string => {
        const c = safeCount(n);
        return c <= 0 ? 'No wears logged yet' : `You logged ${wearsLabel(c)}`;
      },
      /**
       * Days-dressed of days-in-month. Both numbers coerce at the boundary.
       * `daysDressed(18, 31)` → "Dressed on 18 of 31 days".
       */
      daysDressed: (dressed: number, daysInMonth: number): string =>
        `Dressed on ${safeCount(dressed)} of ${safeCount(daysInMonth)} days`,
      /** Section label above the month's most-worn pieces. */
      topPieces: 'Your most-worn pieces',
      /**
       * The month's most-worn category, from an already-lowercased category label
       * (the same map {@link strings.closet.categoryLabel} draws from).
       * `mostWornCategory('tops')` → "Mostly tops this month".
       */
      mostWornCategory: (label: string): string => `Mostly ${cleanText(label, 'a mix')} this month`,
      /**
       * The piece that earned its keep most — the lowest cost per wear. Takes an
       * already-formatted price and the item's label. `bestCostPerWear('$4', 'navy
       * blazer')` → "Best value: your navy blazer at $4 per wear".
       */
      bestCostPerWear: (price: string, itemLabel: string): string =>
        `Best value: your ${cleanText(itemLabel, 'go-to piece')} at ${cleanText(price, '—')} per wear`,
      /**
       * Empty-month recap line — nothing to recap yet. Warm; frames the card as
       * something that fills in over the month rather than a blank scold.
       */
      empty: 'No wears logged this month yet — your recap fills in as you go.',
      /** Footer tag for the screenshot — a quiet brand mark, no call to action. */
      shareTag: 'Tracked with Era',
    },

    // --- quick-log: the item-level "worn today" tap ---

    /**
     * Confirmation after logging a single piece as worn today — the item-level
     * counterpart to the outfit-level {@link strings.outfits.wearLogged} and
     * {@link strings.ovi.woreItConfirmed}. Kept distinct so it doesn't duplicate
     * them: this one names the day.
     */
    logged: 'Logged for today.',
    /** Quick-log failed — honest, no blame, invites a retry. */
    logFailed: "That didn't log — give it another go.",
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

  /**
   * The Feed tab — a full-screen outfit-inspo feed (looks and eras people share
   * publicly). This surface owns the social read: the per-post action rail
   * (like/save/shop-similar/more), sharing a look TO the feed, the "shop similar
   * from your closet" sheet (the trust rule, carried into the feed), and the UGC
   * safety Apple requires — report and block. Voice stays Era's: calm, honest, no
   * fake social pressure and no engagement-bait. The safety copy is plain and
   * reassuring, never alarmist — a report is acknowledged without drama, a block
   * is stated as a clean, reversible boundary. No exclamation marks here: the
   * deck's single-exclamation budget is spent elsewhere.
   */
  feed: {
    /** Empty feed — invitational, not a scold; no fake social pressure. */
    empty: 'Nothing in your feed yet. Follow a few people and their looks land here.',
    /** Shown at the very end of the feed — a quiet stop, not a nudge to keep scrolling. */
    feedEnd: "You're all caught up.",
    /** Quiet inline line while the next page fetches (web list; mobile uses a spinner). */
    loadingMore: 'Loading…',

    // --- the per-post action rail: like, save, shop similar, more ---

    /** Accessible labels for the rail actions — a bare icon doesn't say what a tap does. */
    rail: {
      like: 'Like',
      save: 'Save',
      shopSimilar: 'Shop similar',
      more: 'More',
    },

    // --- sharing a look TO the feed, and taking it back down ---

    /** Action that shares a saved outfit or era publicly to the feed. */
    share: 'Share to feed',
    /**
     * Rendered beside every share affordance — the consent line. Posting makes
     * the look public REGARDLESS of profile privacy (the server deliberately
     * overrides the privacy bit for posted covers), and flipping a profile
     * private later does not retract posts — unshare does. Both facts live in
     * this one calm sentence; never ship a share button without it.
     */
    shareConsent: 'Anyone can see shared looks, even if your profile is private. You can remove a look anytime.',
    /** Resting state once a look is shared — a fact, paired with {@link strings.feed.unshare}. */
    shared: 'On your feed',
    /** Take a shared look back down. Unshare is the retraction; it's a clean removal, no guilt. */
    unshare: 'Remove from feed',

    // --- shop similar from your closet: the trust rule inside the feed ---

    /** Sheet title for "what of mine wears with this look". */
    shopSimilarTitle: 'From your closet',
    /** Empty state when the viewer owns nothing that matches — honest, never a push to buy. */
    shopSimilarEmpty: 'Nothing in your closet matches this yet.',
    /** Points at Shop for a real gap — plain, not pushy; the way out of the empty state. */
    shopSimilarGapCta: 'Find the gap in Shop',

    // --- report a post or profile: the UGC safety Apple requires ---

    /** Report-sheet title — names the action plainly, no drama. */
    reportTitle: 'Report this post',
    /** The submit CTA at the end of the report form — a verb, distinct from the title. */
    reportSubmit: 'Submit report',
    /**
     * Labels for the four report reasons, keyed by the `ReportReason` union in
     * `@era/core/feed`. Plain nouns a reviewer and a reporter both read the same
     * way; `other` pairs with the free-text detail below.
     */
    reportReasons: {
      spam: 'Spam',
      inappropriate: 'Inappropriate',
      impersonation: 'Impersonation',
      other: 'Something else',
    },
    /** Placeholder for the optional free-text detail on a report. */
    reportDetailPlaceholder: 'Add any detail that helps (optional)…',
    /** Confirmation after a report is filed — acknowledges it, hides the post, no drama. */
    reportConfirm: "Post hidden. Thanks — we'll take a look.",

    // --- block an account: a clean, bidirectional, reversible boundary ---

    /** Block-sheet title, naming the person. `blockTitle('Mara')` → "Block Mara?" */
    blockTitle: (name: string): string => `Block ${cleanText(name, 'this account')}?`,
    /** The one calm line explaining what a block does — plain, reassuring, reversible. */
    blockBody:
      "You won't see each other's posts or profiles, and they won't be told. You can undo this anytime in Settings.",
    /** The confirm action on the block sheet. */
    blockCta: 'Block',
    /** Confirmation after a block — states the result, asks for nothing further. */
    blockedConfirm: 'Blocked. Their posts are gone from your feed.',

    /** A11y label / marker for a post hidden in place after a report or block. */
    hiddenPost: 'Post hidden',
  },

  /**
   * Turnaround views — the flag-gated multi-angle renders of a closet piece
   * (three-quarter, side, back) an image API generates from the item's cutout and
   * Claude vision QAs before any render is shown. This copy lives on the closet
   * detail surface, where the angles appear beside the straight-on cutout. Voice
   * stays Era's: quiet and honest, no exclamation. The `generating` and `failed`
   * lines carry the async beats — a patient wait and a calm, retryable miss — and
   * {@link strings.turnaround.unavailable} is the dormant "not switched on yet"
   * beat, never an error banner. {@link strings.turnaround.angleLabel} names each
   * viewpoint plainly for screen readers, keyed by the `TurnaroundAngle` union in
   * `@era/core/turnaround`; an unknown angle falls back to a plain "Other view" so
   * it never renders a raw slug.
   */
  turnaround: {
    /** Section / affordance label that opens the angle views on the item detail. */
    viewAngles: 'View angles',
    /** Progress line while the angles are being rendered and QA'd. Patient, plain. */
    generating: 'Rendering angles…',
    /**
     * The render run failed — calm, no blame, retryable. Only for states that
     * re-offer the affordance; a terminal zero-render run shows
     * {@link strings.turnaround.noAngles} instead (never name a retry the UI
     * doesn't offer).
     */
    failed: "Couldn't render the angles just now — give it another go.",
    /**
     * Terminal state — the run completed but the quality gate accepted nothing.
     * No retry verb on purpose: this state renders no button, so the copy must
     * not invite an action that isn't there.
     */
    noAngles: 'The straight-on view is all we have for this piece.',
    /**
     * Dormant state — turnaround isn't switched on for this piece (or the feature
     * is off server-side). Matches the app's dormant voice: a quiet "coming soon"
     * beat, never an error or "not configured".
     */
    unavailable: "Extra angles aren't available for this piece yet.",
    /**
     * Accessible label for a rendered angle, keyed by the `TurnaroundAngle` union.
     * Screen-reader plain: `angleLabel('three_quarter')` → "Three-quarter view".
     * Unknown angles fall back to "Other view" so this never leaks a raw slug.
     */
    angleLabel: (angle: string): string => {
      switch (angle) {
        case 'three_quarter':
          return 'Three-quarter view';
        case 'side':
          return 'Side view';
        case 'back':
          return 'Back view';
        default:
          return 'Other view';
      }
    },
  },

  /**
   * Virtual try-on — the flag-gated Era+ surface where a user builds a consented
   * avatar from their own photos and renders a saved outfit onto it ("See it on
   * you"). This copy spans the consent screen, the avatar build, the render
   * progress, the staleness re-render prompt, the dormant/failed beats, and the
   * deletion confirmation. Voice stays Era's: quiet and honest, no exclamation, no
   * pressure. The consent copy is load-bearing and deliberately plain — it names
   * exactly what happens to the photos (used once, sent to a try-on provider,
   * originals deleted right after) and where the avatar lives (private, encrypted
   * at rest, only the user, deletable anytime), because informed consent is the
   * whole point of the surface; never ship the avatar build without it. The
   * dormant {@link strings.tryon.unavailable} is a "not switched on yet" beat, not
   * an error banner, and {@link strings.tryon.monthlyLimit} frames the render cap
   * as a calm pause, never a scold or a nudge to pay more. The count helpers are
   * boundary-hardened via {@link safeCount} (NaN/garbage → 0) so a partial render
   * or delete never leaks "undefined"/"NaN".
   */
  tryon: {
    // --- the consent screen: the informed opt-in before any photo is sent ---

    /**
     * The consent screen. `heading` opens it; `body` is the plain, itemized truth
     * about the photo flow and where the avatar lives — each line stands on its own
     * so it can render as a checklist. This is the informed-consent contract: the
     * avatar build must not proceed without the user agreeing to exactly these
     * facts. {@link strings.tryon.consentAgree} is the single affirmative action.
     */
    consent: {
      /** Consent-screen heading — names the payoff plainly, no hype. */
      heading: 'See your outfits on you',
      /**
       * The itemized consent facts, each a standalone line: what the photos are for,
       * who processes them, that the originals are deleted right after creation, how
       * the avatar is stored, and that it's deletable anytime. Kept as an array so
       * the UI can render them as distinct, scannable points.
       */
      body: [
        'Your photos are used once, to build your avatar.',
        'They’re processed by our try-on provider to create it.',
        'The originals are deleted right after your avatar is made.',
        'Your avatar is stored privately and encrypted at rest — only you can see it.',
        'You can delete it anytime in Settings.',
      ] as const,
    },
    /** The affirmative consent action — one clear, unhedged agreement to build the avatar. */
    consentAgree: 'I agree — create my avatar',

    // --- the entry point + premium badge ---

    /** The action that renders a saved outfit onto the avatar, on the outfit surface. */
    seeItOnYou: 'See it on you',
    /** The Era+ badge shown beside {@link strings.tryon.seeItOnYou} for a gated user. */
    plusBadge: 'Era+',

    // --- building the avatar, then dressing it: the two async progress beats ---

    /** Progress line while the avatar likeness is being created from the photos. Patient, plain. */
    creating: 'Building your avatar…',
    /** Progress line while a saved outfit is rendered onto the avatar, garment by garment. */
    rendering: 'Dressing your avatar…',
    /**
     * Partial-progress line during a multi-garment render — how many pieces have
     * landed so far. `partial(2, 4)` → "2 of 4 pieces rendered". Both numbers
     * coerce at the boundary so a mid-render frame never reads "undefined".
     */
    partial: (n: number, total: number): string =>
      `${safeCount(n)} of ${safeCount(total)} pieces rendered`,

    // --- staleness: the outfit changed since it was last rendered ---

    /**
     * Shown when the stored render no longer matches the outfit's current pieces
     * (see {@link itemsSignature}). Honest and low-key — a render costs a credit, so
     * this offers the update rather than auto-spending, with no pressure to take it.
     */
    stale: 'This look changed — update the render?',
    /** The explicit re-render action for a stale render — a visible, deliberate credit spend. */
    updateRender: 'Update render',

    // --- the calm edge states: nothing to render, dormant, failed ---

    /**
     * Terminal calm state — the outfit holds nothing try-on can render (only skipped
     * pieces like bags or accessories). No retry verb: there's nothing to try, so the
     * copy states the fact without inviting an action that isn't there.
     */
    noGarments: "There's nothing here I can render on you yet — add a top, a dress, or shoes to this look.",
    /**
     * Dormant state — try-on isn't switched on (the feature is off server-side).
     * Matches the app's dormant voice: a quiet "coming soon" beat, never an error or
     * "not configured".
     */
    unavailable: "Seeing outfits on you isn't available just yet — it's coming soon.",
    /** The render run failed — calm, no blame, retryable. */
    failed: "Couldn't dress your avatar just now — give it another go.",

    // --- deletion + the monthly render cap ---

    /**
     * Confirmation after the avatar (and any renders) are permanently deleted, from
     * the count of images removed. States the plain result — this is a permanent
     * delete, honestly named. `deleted(0)` → "Your avatar and 0 images were
     * permanently deleted."; `deleted(3)` → "…and 3 images were…". Coerces at the
     * boundary so a partial delete never renders "undefined".
     */
    deleted: (count: number): string => {
      const c = safeCount(count);
      return `Your avatar and ${c} ${c === 1 ? 'image was' : 'images were'} permanently deleted.`;
    },
    /**
     * Shown when the user hits their monthly render cap. A calm pause, not a scold
     * and not an upsell: the cap is a cost guardrail, so this owns the wait for the
     * month to roll over without hinting there's more to buy.
     */
    monthlyLimit: "You've styled your avatar plenty this month — the render count resets next month, and everything you've made is saved.",
    /**
     * A DELETE of the avatar failed — its own line, never the render-failure
     * copy (telling someone we couldn't "dress" the avatar they tried to
     * delete is wrong twice over).
     */
    deleteFailed: "Couldn't delete your avatar just now — give it another go.",
  },

  /**
   * Public profile pages — a user's closet, eras, and outfits as seen by someone
   * else (or previewed by the owner). The counterpart to the private in-app tabs:
   * where {@link strings.closet}/{@link strings.design} speak to the owner in the
   * second person ("your closet"), this surface speaks ABOUT the owner in the
   * third person to a viewer, and it is the one place following happens. Voice
   * stays Era's — warm, calm, never pushy: a private closet is stated plainly
   * with no shame, a thin profile still reads as composed, and the follow control
   * never manufactures social pressure. Follow state is modeled as three distinct
   * labels rather than a hover trick: `followCta` (not yet following),
   * `followingState` (the resting label once you follow — web reveals
   * `unfollowCta` on hover, mobile taps through to it), so the copy carries no
   * platform assumption. Every count helper is boundary-hardened via {@link
   * safeCount} (NaN/garbage → 0, singular at one) and every interpolated name
   * through {@link cleanText} (a missing display name never leaves a dangling
   * possessive), so the voice-lint can probe them with any input without a throw
   * and a partial profile never leaks "undefined". Section headings are plain
   * third-person nouns — the public-page counterpart to the owner-context "Your
   * eras" ({@link strings.design.eraSectionTitle}).
   */
  profile: {
    // --- following: the one social action on the page ---

    /** Follow button, not-yet-following state. */
    followCta: 'Follow',
    /**
     * The resting label once you follow — the state, not an action. Web reveals
     * {@link strings.profile.unfollowCta} on hover; mobile taps through to it, so
     * this label itself stays neutral and never has to double as "tap to unfollow".
     */
    followingState: 'Following',
    /** The unfollow affordance (hover-revealed on web, confirm on mobile). Plain, no guilt. */
    unfollowCta: 'Unfollow',
    /**
     * Follower count label, singular at one, zero-hardened. `followerCount(0)` →
     * "0 followers", `followerCount(1)` → "1 follower", `followerCount(12)` →
     * "12 followers". Coerces at the boundary so a partial render never reads
     * "undefined followers".
     */
    followerCount: (n: number): string => {
      const c = safeCount(n);
      return `${c} ${c === 1 ? 'follower' : 'followers'}`;
    },
    /**
     * Following count label — "following" is invariant (no plural), so this only
     * needs the number. `followingCount(0)` → "0 following", `followingCount(8)` →
     * "8 following". Zero-hardened via {@link safeCount}.
     */
    followingCount: (n: number): string => `${safeCount(n)} following`,
    /**
     * Shown to a signed-out viewer where the follow button would be — names the
     * person so the ask is concrete, and points at sign-in without pressure. Falls
     * back to a plain "this closet" when the profile has no display name yet.
     * `signInToFollow('Mara')` → "Sign in to follow Mara."
     */
    signInToFollow: (name: string): string => `Sign in to follow ${cleanText(name, 'this closet')}.`,

    // --- private profile: the closet is kept off the public page ---

    /**
     * Heading when the profile is private ({@link isPrivate} true) — honest and
     * warm, no shame, no pressure. Names the person; falls back gracefully when
     * there's no display name. `privateHeading('Mara')` → "Mara keeps their closet
     * private." Pairs with {@link strings.profile.privateBody}.
     */
    privateHeading: (name: string): string => `${cleanText(name, 'This person')} keeps their closet private.`,
    /** The one calm line under a private heading — states the fact, asks for nothing. */
    privateBody: "There's nothing to see here for now, and that's completely their call.",

    // --- empty / thin public profile: still composed, never a scold ---

    /**
     * Shown to a viewer when a public profile has nothing (or almost nothing)
     * public yet. Warm and composed — the profile still feels considered, not
     * broken. Names the person; falls back gracefully. `emptyPublic('Mara')` →
     * "Mara hasn't shared any pieces yet."
     */
    emptyPublic: (name: string): string => `${cleanText(name, 'This person')} hasn't shared any pieces yet.`,
    /**
     * The owner previewing their own thin profile. Unlike the viewer line, this one
     * points at the fix plainly — flip pieces to public — without nagging. Pairs
     * with the closet privacy toggle ({@link strings.closet.privacyPublic}).
     */
    emptyPublicOwn:
      "Nothing here is public yet. Set a few pieces to public and they'll show up on your profile.",

    // --- section headings: plain third-person nouns for the public page ---

    /**
     * The three section headings on a public profile. Plain nouns, not the owner's
     * "Your eras" — this page is third-person. Reuses the same concepts the app
     * tabs own ({@link strings.closet}, {@link strings.design}) rather than coining
     * new ones.
     */
    sections: {
      closet: 'Closet',
      eras: 'Eras',
      outfits: 'Outfits',
    },

    // --- own-profile affordances: preview hint + share ---

    /** Hint shown to the owner while viewing their own public profile. */
    ownProfileHint: 'This is how your profile looks to others.',
    /** Copy-the-profile-link action (distinct from the OS share sheet, {@link strings.common.share}). */
    copyLinkCta: 'Copy profile link',
    /**
     * Confirmation after the profile link is copied. Shares the wording of {@link
     * strings.settings.receiptAddress.copied} deliberately — one "copied to
     * clipboard" idiom across the app — kept as a local sibling rather than a
     * shared constant so each surface reads independently.
     */
    linkCopied: 'Copied to your clipboard.',

    // --- OG / SEO meta for a shared public profile ---

    /**
     * The meta/OpenGraph description for a public profile page, from the owner's
     * display name (or username) and their public piece count. Feeds SEO, so it is
     * hard-capped at 155 chars — long names are truncated with an ellipsis rather
     * than overrunning. Boundary-hardened: the name falls back via {@link
     * cleanText} and the count coerces via {@link safeCount} (singular at one), so
     * a partial profile never renders "undefined" or "NaN". `metaDescription('Mara
     * Lin', 42)` → "Mara Lin's closet on Era — 42 pieces, styled by Ovi."
     */
    metaDescription: (name: string, itemCount: number): string => {
      const who = cleanText(name, 'A closet');
      const c = safeCount(itemCount);
      const pieces = c === 1 ? '1 piece' : `${c} pieces`;
      const line = `${who}'s closet on Era — ${pieces}, styled by Ovi.`;
      return line.length <= 155 ? line : `${line.slice(0, 154).trimEnd()}…`;
    },
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
     * Wardrobe gaps — the honest, restrained answer to "what am I missing?". The
     * engine surfaces at most a handful of GENUINE gaps: categories thin enough
     * that one more piece meaningfully unlocks looks from what's already owned.
     * This is not a shopping list and never manufactures need — a well-covered
     * closet shows few gaps, often none (see {@link strings.shop.gaps.empty}).
     * Every line here reports only the numbers the engine passes in; it never
     * overstates. Category names come lowercased mid-sentence from the same map
     * {@link strings.closet.categoryLabel} uses, so the copy and the gallery agree.
     */
    gaps: {
      /** Section heading — sets the restrained frame before any gap is listed. */
      title: 'A few real gaps',
      /**
       * One-line intro. Names these as genuine gaps, not a feed, and sets the
       * honest expectation that a covered closet has few — sometimes none.
       */
      intro:
        "These are genuine gaps — the pieces that would unlock the most from what you already own. A covered closet shows only a few, sometimes none.",
      /**
       * The heart of the feature: ONE honest sentence per gap, built from the
       * gap's own numbers. Names the thin category, how little is owned, the
       * owned categories a new piece would pair with, and how many new outfits it
       * unlocks — never more than the fields say. `ownedCount` 0 reads as a plain
       * "you have no ___ yet"; otherwise it counts what's there without a scold.
       */
      reason: (gap: {
        readonly category: string;
        readonly ownedCount: number;
        readonly unlocksOutfits: number;
        readonly pairsWith: readonly string[];
      }): string => {
        const cat = categoryLabelLower(gap.category);
        const pairs = joinCategoryLabels(gap.pairsWith);
        // Coerce at the boundary so a partial/absent field never renders as
        // "undefined" or NaN in user-facing copy.
        const owned = typeof gap.ownedCount === 'number' ? gap.ownedCount : 0;
        const unlockCount = typeof gap.unlocksOutfits === 'number' ? gap.unlocksOutfits : 0;
        const unlocks = unlockCount > 0;
        // What one more piece would do — pair, unlock, or both. Stays truthful:
        // drops any clause the passed-in fields don't support.
        let tail: string;
        if (pairs && unlocks) tail = `would pair with your ${pairs} to unlock ${newOutfits(unlockCount)}`;
        else if (unlocks) tail = `unlocks ${newOutfits(unlockCount)}`;
        else if (pairs) tail = `would pair with your ${pairs}`;
        else tail = 'would round things out';
        return owned <= 0
          ? `You have no ${cat} yet — adding one ${tail}.`
          : `You're light on ${cat} — ${owned} in your closet so far, and one more ${tail}.`;
      },
      /** Outfit-unlock badge on a gap card. Singular at one: "Unlocks 1 new outfit". */
      unlocksLabel: (n: number): string => `Unlocks ${newOutfits(n)}`,
      /** CTA that opens Shop pre-filtered to the gap's category — plain, not pushy. */
      fillCta: 'Fill this gap',
      /**
       * Empty state — the brand's whole point. When the closet is well-covered,
       * we say so warmly and ask for nothing. No fabricated gap, no nudge to buy.
       */
      empty: 'Your essentials are covered — nothing to chase right now.',
      /**
       * Ovi's lead-in when she presents gaps in chat (the "What am I missing?"
       * intent). Restrained and honest: frames the list as the few pieces worth
       * adding, and quietly reaffirms that most of what she'll suggest is already
       * buildable from the closet. Pairs with {@link strings.ovi.gapHonest}.
       */
      oviIntro:
        "Here's what I'd actually add — just the real gaps, nothing you don't need. Everything else, you can already build.",
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
    /** Share action label — reused wherever a surface exports via the OS sheet. */
    share: 'Share',
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

    /**
     * The personal receipt-forwarding address — the transport upgrade of the
     * paste-based {@link strings.closet.importReceipt} flow. Instead of pasting an
     * order email, the user gets a private address (e.g. `u_k3v9…@in.era.style`),
     * adds it to their contacts, and forwards store confirmations to it; the
     * purchased pieces land in their closet as drafts to review. This copy lives
     * in Settings because that's where the address is revealed, copied, and
     * regenerated (web + mobile) — mirroring the {@link strings.settings.priceAlerts}
     * precedent, a feature-config section with a heading, explainer, actions, and
     * honest notes. Voice stays warm and plain: no "inbound transport" jargon,
     * honest about what rotation costs, and the privacy note mirrors the privacy
     * policy verbatim in spirit (mail read once for the garments, never stored).
     * The one count helper is boundary-hardened via {@link safeCount} (NaN/garbage
     * → 0) so the voice-lint can probe it with any input without a throw and a
     * partial/absent count never leaks "undefined".
     */
    receiptAddress: {
      /** Section heading in Settings. */
      title: 'Your receipt address',
      /**
       * Explainer under the heading: what the address is and what to do with it.
       * Names the gesture plainly (forward a store's order email) and sets the
       * honest expectation that what lands are drafts to review, not finished
       * closet entries — the same promise {@link strings.closet.importReceipt.instruction}
       * makes for the paste path.
       */
      explain:
        "Forward a store's order confirmation to this private address and the pieces show up in your closet as drafts to review. Add it to your contacts so it's ready when you need it.",
      /** Caption above the revealed address (the address itself renders beside it). */
      addressLabel: 'Your private address',
      /** Copy-to-clipboard action label. */
      copyCta: 'Copy',
      /** Confirmation line after the address is copied. */
      copied: 'Copied to your clipboard.',
      /** Regenerate action label — rotates to a fresh address. */
      regenerateCta: 'Regenerate address',
      /**
       * The honest consequence line, shown before regenerating. Rotation is a HARD
       * kill: the old address dies the instant a new one is minted (the reason to
       * regenerate is usually a leaked address, so the old token must stop working
       * immediately). Mail that arrives after that — even seconds later — is
       * dropped, not delivered. We say so plainly rather than promising delivery we
       * won't make; drafts already pulled from earlier receipts stay in the closet.
       */
      regenerateConsequence:
        "Your old address stops working the moment you regenerate — anything sent to it after that won't arrive.",
      /** Confirmation after a new address is generated — pairs with the reveal of the new one. */
      regenerated: "Here's your new address. The old one won't accept mail anymore.",
      /**
       * Privacy note under the address. Mirrors the privacy policy in spirit: mail
       * to this address is read once for the purchased pieces, then discarded — the
       * email itself is never stored. Honest and plain, not apologetic-corporate.
       */
      privacyNote:
        'Mail sent here is read once for the pieces you bought, then discarded — we never store the email itself.',
      /**
       * Dormant state — shown when inbound receipts aren't switched on server-side
       * yet (no inbound domain configured). Matches the app's dormant voice — a
       * quiet "coming soon" beat, never an error or "not configured" — and points
       * at the paste path that works today. Kin to {@link strings.closet.bulkCapture.dormant}.
       */
      dormant:
        "Forwarding receipts to your own address is something I'm still switching on — it'll be here soon. For now, you can paste an order email under Add a piece.",
      /**
       * In-app notification when forwarded receipts land as drafts — the async
       * counterpart to the in-flow {@link strings.closet.importReceipt.added} toast.
       * Singular at one; warm, no urgency, invites a look rather than demanding one.
       * A zero result shouldn't fire a notification at all, but the helper stays
       * safe at 0 (and at NaN/garbage via {@link safeCount}) so a bad count never
       * throws or leaks "undefined". `newDrafts(0)` / `newDrafts(1)` / `newDrafts(3)`.
       */
      newDrafts: (n: number): string => {
        const c = safeCount(n);
        if (c <= 0) return 'No new drafts from your receipt yet.';
        return c === 1
          ? '1 new draft from your receipt — take a look when you have a minute.'
          : `${c} new drafts from your receipt — take a look when you have a minute.`;
      },
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
   * Era+ — the optional paid tier. The copy holds the line the brand cares about:
   * calm, quiet-luxury, and scrupulously honest — no fake urgency, no countdowns,
   * no guilt if you pass. The monthly and annual plans are the SAME Era+; annual is
   * simply billed once a year.
   *
   * NO PRICES LIVE HERE. Every dollar amount — and any real "savings" figure — comes
   * from Stripe at runtime and is threaded into the paywall as data, never written
   * into copy. That way billing and the words on screen can't drift apart: if a
   * price changes in Stripe, nothing here goes stale. This block is words only:
   * names, cadence, notes, CTAs, and state lines.
   */
  plus: {
    /** Back affordance on the paywall — returns to Settings, where the row lives. */
    back: 'Settings',

    /** Paywall headline. The product name carries it; no exclamation, no hype. */
    paywallTitle: 'Era+',
    /** One calm line under the title — what it is, without overselling. */
    paywallSubtitle: 'A few considered extras for the wardrobe you’re building.',

    // The plan cards — words only; the price is Stripe/StoreKit-sourced at runtime
    // and threaded in as data, never written into copy. Flat keys (no nested plan
    // objects) so consumers read one leaf per label.
    /** Monthly plan card name. */
    monthlyLabel: 'Monthly',
    /** Monthly plan cadence line. */
    monthlyCadence: 'Billed monthly',
    /** Annual plan card name (visually primary; price + any real saving come from Stripe). */
    annualLabel: 'Annual',
    /** Annual plan cadence line. */
    annualCadence: 'Billed yearly',
    /** Best-value marker — only shown once a real, Stripe-sourced saving substantiates it. */
    bestValue: 'Best value',

    /**
     * The savings line on the annual card. The amount is computed from the two
     * REAL Stripe prices (twelve months at the monthly rate versus one year at
     * the annual rate) and rendered only when the difference is genuinely
     * positive — this template supplies the words, never the number.
     */
    savingsPerYear: (amount: string) => `Save ${amount} a year`,

    /**
     * Honest framing shown near the plans. Number-free by design: it states the one
     * true, price-independent fact — both plans are the same Era+ — and leaves the
     * money to the Stripe-sourced price. A concrete saving, when known, is shown on
     * the annual card from Stripe data, never asserted here.
     */
    honestAnnualNote:
      'Both plans are the same Era+ — annual is simply billed once a year. Monthly holds nothing back.',

    /**
     * Shown ONLY when the cards render price-free (the Stripe price feed is
     * dormant or momentarily unreachable). Without it, "Continue" asks for a
     * blind click-through to learn the price — this line keeps that step honest
     * (Axiom's paywall-gate note). Checkout always shows the exact price before
     * any charge; this just says so up front.
     */
    pricePendingNote: 'You’ll see the exact price at checkout before you pay.',

    /** Primary CTA on a plan card — advances to Stripe checkout. */
    checkoutCta: 'Continue',
    /** In-flight state while we hand off to checkout. Reassuring, not anxious. */
    checkoutBusy: 'Taking you to checkout…',
    /** Checkout couldn’t be reached — calm, retryable, no alarm. */
    checkoutError: 'We couldn’t reach checkout just now — please try again.',
    /** Returned from a cancelled checkout — no guilt, no pressure. */
    checkoutCanceled: 'No rush — Era+ will be here whenever you’re ready.',
    /** Returned from a completed checkout (may lag the webhook by a beat). */
    justSubscribed: 'You’re on Era+. Welcome in — it may take a moment to show everywhere.',

    /** Heading of the "you’re already subscribed" management state. */
    alreadyPlus: 'You’re on Era+',
    /** Body of that state — warm thanks, and where to manage things. */
    alreadyPlusBody:
      'Thank you for backing Era. Update your payment details or cancel whenever you like — your plan stays exactly as it is until you do.',
    /** Section label above the manage/cancel actions. */
    managePlan: 'Your plan',
    /** Opens the Stripe customer portal (update card, invoices, cancel). */
    portalCta: 'Manage plan',
    /** The no-lock-in reassurance, shown under the plans and in the manage state. */
    cancelAnytime: 'Cancel anytime. No lock-in, no fine print.',
    /** Quiet link for someone who subscribed elsewhere — routes to the portal. */
    restorePurchases: 'Already subscribed? Manage your plan',
    /**
     * The literal iOS restore affordance. Apple review expects a plainly-labeled
     * "Restore purchases" action wherever purchases are sold — the web-flavored
     * `restorePurchases` link above is a portal route, not a StoreKit restore,
     * so the two must stay separate keys.
     */
    restoreCta: 'Restore purchases',
    /** Restore ran (iOS) but found nothing — factual, no blame, no push to buy. */
    restoreEmpty: 'We couldn’t find a past subscription on this account.',
    /** Purchases can’t run right now (feature dormant / store unreachable) — calm, no error tone. */
    unavailable: 'Era+ isn’t available just yet — check back soon.',

    /** Settings-surface entry copy (row label + hint). */
    settingsRowLabel: 'Era+',
    settingsRowHint: 'A few considered extras.',
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

  /**
   * Share — the one-tap collage export. Every entry point composes an on-brand
   * 1080×1920 image (outfit, era, or the month recap) and hands it to the native
   * share sheet. Calm and plain, no exclamations and no "post it!" push — the
   * verbs describe the action, nothing more. A failed export reuses
   * {@link strings.errors.generic}; there is deliberately no `failed` leaf here so
   * the copy stays single-sourced. `watermarkDomain` is the quiet mark burned into
   * every card, under the wordmark.
   */
  share: {
    /** Action on a saved outfit — exports the look as a share card. */
    shareLook: 'Share look',
    /** Action on an era card — exports the era as a share card. */
    shareEra: 'Share era',
    /** Action on the monthly recap — exports "your month, worn" as a share card. */
    shareMonth: 'Share your month',
    /** Busy label while the image is composed and the sheet opens. */
    preparing: 'Preparing…',
    /** The footnote mark under the wordmark watermark on every share card. */
    watermarkDomain: 'era.style',
  },

} as const;

/** The shape of the full copy deck — for typing consumers and adapters. */
export type OviStrings = typeof strings;

/** The public-profile copy deck — the profile page's single source of truth. */
export type ProfileStrings = OviStrings['profile'];

/** The marketing/site copy deck — the landing page's single source of truth. */
export type SiteStrings = OviStrings['site'];

/** One titled marketing section on the landing page (an entry in `site.sections`). */
export type MarketingSection = SiteStrings['sections'][number];

/** Entity descriptions for JSON-LD (Organization + SoftwareApplication). */
export type SiteSeo = SiteStrings['seo'];

/** One landing-FAQ Q&A — an entry in `site.faq`, also the source for FAQPage schema. */
export type SiteFaqEntry = SiteStrings['faq'][number];
