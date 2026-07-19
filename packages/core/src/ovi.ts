/**
 * @era/core — Ovi's styling brain. Client-safe, testable, dependency-light.
 *
 * This is the ground truth for what Ovi suggests. Two paths share one contract:
 * a Claude path (the prompt builders + the structured-output schemas here feed
 * `messages.parse` in the ovi-chat route) and a deterministic fallback stylist
 * (`composeOutfit`) that assembles a real look from the user's own closet with
 * no model in the loop. The fallback is always sufficient on its own — Ovi never
 * dead-ends because a key is missing or a request failed.
 *
 * The hard rule, baked into both paths: style from the pieces the user already
 * owns. Only flag buying for a genuine gap, and never over a look the closet can
 * already make. Ovi is warm, concise, and honest before she is anything else.
 *
 * No server-only imports live here (no DB, no R2) so this subpath is safe in a
 * client bundle. User-facing copy comes from Quill's deck via `./strings.ts`.
 *
 * Import via the `@era/core/ovi` subpath.
 */

import { z } from 'zod';

import { strings } from './strings.ts';

// -----------------------------------------------------------------------------
// Contract types — what Nova/Harbor render and Forge loads against
// -----------------------------------------------------------------------------

/** What the caller wants from Ovi on this turn. */
export type OviIntent = 'style_for' | 'today' | 'style_item' | 'whats_missing' | 'chat';

/**
 * The compact inventory shape Ovi reasons over. Deliberately image-free and
 * path-free (the client resolves displayUrls from its own item list): only the
 * signals that matter for styling, keeping the LLM context token-lean and never
 * leaking storage keys into a prompt.
 */
export interface OviItem {
  readonly id: string;
  readonly category: string;
  readonly colors: readonly string[];
  readonly pattern: string | null;
  readonly brand: string | null;
}

/** The slice of the style profile Ovi needs — the rest never enters a prompt. */
export interface StyleProfileLite {
  readonly archetype: string;
  readonly palette: readonly string[];
  readonly keywords: readonly string[];
}

/** A recent wear, trimmed to what recency-avoidance needs. */
export interface WearLogLite {
  readonly itemIds: readonly string[];
  readonly wornOn: string;
}

/** Current conditions Ovi styles around. Coarse by design — no coordinates. */
export interface Weather {
  readonly tempC: number;
  readonly condition: string;
  readonly description: string;
}

/**
 * A look Ovi proposes, referencing real closet item ids only. The client
 * resolves each id to its stored image; Ovi never invents an item.
 */
export interface ProposedOutfit {
  readonly name: string;
  readonly occasion: string;
  readonly itemIds: readonly string[];
  readonly rationale: string;
}

/** Ovi's reply for a turn: a spoken line, and a look when the ask was a styling one. */
export interface OviResponse {
  readonly reply: string;
  readonly outfit: ProposedOutfit | null;
}

// -----------------------------------------------------------------------------
// Structured-output schemas — reused as the Anthropic output format AND to
// validate the model's proposal before it reaches the client
// -----------------------------------------------------------------------------

/**
 * A proposed outfit. Structured-output-safe: plain object, arrays of strings,
 * no numeric bounds or refinements, so it can back a Claude structured response
 * as-is and validate the parsed result on the way back.
 */
export const ProposedOutfitSchema = z.object({
  name: z.string(),
  occasion: z.string(),
  itemIds: z.array(z.string()),
  rationale: z.string(),
});

/** Ovi's full response. `outfit` is nullable — a chat turn need not propose a look. */
export const OviResponseSchema = z.object({
  reply: z.string(),
  outfit: ProposedOutfitSchema.nullable(),
});

// -----------------------------------------------------------------------------
// Category model — the enum values (see @era/db item_category) grouped by role
// -----------------------------------------------------------------------------

/** Categories that can anchor a look. A dress needs no bottom; a top does. */
const BASE_CATEGORIES = ['dress', 'top'] as const;
const BOTTOM_CATEGORY = 'bottom';
const SHOES_CATEGORY = 'shoes';
const OUTERWEAR_CATEGORY = 'outerwear';
/** Finishing pieces — at most one is added to a look. */
const ACCESSORY_CATEGORIES = ['bag', 'hat', 'scarf', 'watch', 'jewelry', 'accessory'] as const;

/** Essentials, in the order we surface a gap (a missing pair of shoes reads first). */
export const ESSENTIAL_CATEGORIES = [SHOES_CATEGORY, BOTTOM_CATEGORY, 'top', OUTERWEAR_CATEGORY] as const;

/** The role a category plays when assembling a look. The Shop ranker
 * (`@era/core/shop`) reuses this to know which slot a product would fill. */
export type OutfitSlot = 'base' | 'bottom' | 'shoes' | 'outerwear' | 'accessory';

/**
 * Map an item category to its outfit slot, or null for a category that can't
 * enter a look. Mirrors the slot order composeOutfit fills (base → bottom →
 * shoes → outerwear → accessory). A top or a dress can anchor a look, so both
 * map to `base`.
 */
export function slotForCategory(category: string): OutfitSlot | null {
  if ((BASE_CATEGORIES as readonly string[]).includes(category)) {
    return 'base';
  }
  if (category === BOTTOM_CATEGORY) {
    return 'bottom';
  }
  if (category === SHOES_CATEGORY) {
    return 'shoes';
  }
  if (category === OUTERWEAR_CATEGORY) {
    return 'outerwear';
  }
  if ((ACCESSORY_CATEGORIES as readonly string[]).includes(category)) {
    return 'accessory';
  }
  return null;
}

// -----------------------------------------------------------------------------
// Prompt builders — the Claude path (persona + per-turn context)
// -----------------------------------------------------------------------------

/**
 * Ovi's persona and hard rules as a system prompt. Bakes in the trust rule
 * (shop the closet first) and the voice (warm, concise, honest, never pushy),
 * and constrains the model to reference only the real item ids it is given.
 * Weather-aware when conditions are supplied.
 */
export function buildOviSystemPrompt(profile: StyleProfileLite | null, weather?: Weather | null): string {
  const lines: string[] = [
    "You are Ovi, Era's personal stylist. You help someone dress from the clothes they already own.",
    '',
    'Voice: warm, concise, honest, never pushy. Speak in the second person. Say "I" only in genuine stylist moments. No hype, no marketing-speak, no emoji, at most one exclamation mark.',
    '',
    'Hard rules:',
    '- Style ONLY from the inventory you are given. Every item you reference must be one of the provided item ids. Never invent an item, a color, or a brand.',
    '- Shop the closet first. Only mention buying for a real gap the closet genuinely cannot fill — never over a look the closet can already make.',
    '- When the ask is a styling one, propose one coherent outfit as structured output: a base (a top or a dress), a bottom unless the base is a dress, shoes when available, outerwear when the weather calls for it, and at most one accessory. Put the real item ids in itemIds.',
    '- For a "what am I missing" ask, do not force an outfit. Name the single biggest gap honestly and leave outfit null.',
    "- If the closet is too sparse to build an honest look, say so plainly and suggest adding a piece. Never fabricate an item to fill the gap.",
    '- Keep the reply short and specific. The rationale should read like a stylist explaining a choice, not a spec.',
  ];

  if (profile) {
    lines.push(
      '',
      `The person's style profile — lean on it, do not lecture them with it: archetype "${profile.archetype}", palette [${profile.palette.join(', ')}], keywords [${profile.keywords.join(', ')}].`,
    );
  }

  if (weather) {
    lines.push(
      '',
      `Today's weather where they are: ${weather.description}, about ${Math.round(weather.tempC)}°C. Style around it — layers and outerwear when it's cold or wet.`,
    );
  }

  return lines.join('\n');
}

/** The per-turn context handed to the model as the user turn. Token-lean JSON. */
export interface OviUserContextInput {
  readonly intent: OviIntent;
  readonly message: string;
  readonly profile: StyleProfileLite | null;
  readonly items: readonly OviItem[];
  readonly wearLogs: readonly WearLogLite[];
  readonly weather: Weather | null;
  readonly itemContext?: string | null;
}

/**
 * Build the user-turn content: the compact inventory, the profile, recent wears,
 * weather, the intent, and (for style_item) the focal item id. Everything the
 * model needs to propose a look, and nothing it doesn't — no image urls, no paths.
 */
export function buildOviUserContext(input: OviUserContextInput): string {
  const { intent, message, profile, items, wearLogs, weather, itemContext } = input;
  const parts: string[] = [
    `Intent: ${intent}`,
    '',
    'Their closet (the only items you may use):',
    JSON.stringify(items),
    '',
    'Their style profile:',
    JSON.stringify(profile),
    '',
    'Recently worn (prefer pieces not in here when you have a choice):',
    JSON.stringify(wearLogs),
    '',
    'Weather:',
    JSON.stringify(weather),
  ];

  if (intent === 'style_item' && itemContext) {
    parts.push('', `Build the look around this item id: ${itemContext}`);
  }

  if (message.trim().length > 0) {
    parts.push('', 'What they said:', message.trim());
  }

  return parts.join('\n');
}

// -----------------------------------------------------------------------------
// Deterministic fallback stylist — the real engine when there is no model
// -----------------------------------------------------------------------------

/** Inputs to the deterministic stylist. `wearLogs` is optional (recency avoidance). */
export interface ComposeOutfitInput {
  readonly intent: OviIntent;
  readonly items: readonly OviItem[];
  readonly profile: StyleProfileLite | null;
  readonly weather?: Weather | null;
  readonly itemContext?: string | null;
  readonly wearLogs?: readonly WearLogLite[];
}

/** Normalize a color token so a hex/name compares case- and hash-insensitively. */
export function normalizeColor(color: string): string {
  return color.trim().toLowerCase().replace(/^#/, '');
}

/**
 * A normalized lookup set for a style palette. Shared by the deterministic
 * stylist and the Shop ranker (`@era/core/shop`) so both judge color the same
 * way.
 */
export function buildPaletteSet(palette: readonly string[]): Set<string> {
  return new Set(palette.map(normalizeColor));
}

/** True when any of the given colors sits in the (normalized) palette set. */
export function colorsMatchPalette(
  colors: readonly string[],
  palette: ReadonlySet<string>,
): boolean {
  if (palette.size === 0) {
    return false;
  }
  return colors.some((color) => palette.has(normalizeColor(color)));
}

/** True when any of the item's colors sits in the profile palette. */
function matchesPalette(item: OviItem, palette: ReadonlySet<string>): boolean {
  return colorsMatchPalette(item.colors, palette);
}

/** The set of item ids the wearer has worn recently — used to keep looks fresh. */
function recentlyWornIds(wearLogs: readonly WearLogLite[]): Set<string> {
  const worn = new Set<string>();
  for (const log of wearLogs) {
    for (const id of log.itemIds) {
      worn.add(id);
    }
  }
  return worn;
}

/**
 * Pick the best candidate for one slot: prefer a palette match, then a piece not
 * worn recently. Iterates in input order and keeps the first on a tie, so the
 * choice is fully deterministic.
 */
function pickBest(
  candidates: readonly OviItem[],
  palette: ReadonlySet<string>,
  wornIds: ReadonlySet<string>,
): OviItem | undefined {
  let best: OviItem | undefined;
  let bestScore = -1;
  for (const item of candidates) {
    const score = (matchesPalette(item, palette) ? 2 : 0) + (wornIds.has(item.id) ? 0 : 1);
    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }
  return best;
}

/** Whether the weather argues for a layer: cold, or wet/wintry conditions. */
function wantsOuterwear(weather: Weather | null): boolean {
  if (!weather) {
    return false;
  }
  if (weather.tempC <= 15) {
    return true;
  }
  return ['rain', 'snow', 'sleet', 'thunderstorm'].includes(weather.condition);
}

/** A short, human phrase for a piece — brand, else color + category, else category. */
function describePiece(item: OviItem): string {
  if (item.brand) {
    return `your ${item.brand} ${item.category}`;
  }
  const color = item.colors[0];
  if (color && !color.startsWith('#')) {
    return `the ${color.toLowerCase()} ${item.category}`;
  }
  return `the ${item.category}`;
}

/**
 * The reveal ritual's one editorial line (D9) — short enough to sit in italic
 * under the composed card, e.g. "68° and sunny — the cream knit wants out."
 * Deterministic, in Ovi's voice, degrading honestly: weatherless drops the
 * clause, focal-less drops the piece. Never fabricates a condition or an item.
 */
export function composeRevealLine(weather: Weather | null, focal: OviItem | null): string {
  const piece = focal ? describePiece(focal) : null;
  if (weather && piece) {
    return `${Math.round(weather.tempC)}° and ${weather.condition.toLowerCase()} — ${piece} wants out.`;
  }
  if (piece) {
    const capitalized = piece.charAt(0).toUpperCase() + piece.slice(1);
    return `${capitalized} wants out today.`;
  }
  if (weather) {
    return `${Math.round(weather.tempC)}° and ${weather.condition.toLowerCase()} — today's look is ready.`;
  }
  return "Today's look is ready.";
}

/** A weather-aware clause when conditions are present, else empty. */
function weatherClause(weather: Weather | null): string {
  if (!weather) {
    return '';
  }
  const desc = weather.description.toLowerCase();
  return ` It's ${desc} out, so this is built to handle it.`;
}

/** A warm name for a proposed look, grounded in the profile when present. */
function outfitName(profile: StyleProfileLite | null, intent: OviIntent): string {
  const archetype = profile?.archetype;
  if (intent === 'today') {
    return "Today's look";
  }
  if (archetype) {
    return `An easy ${archetype} look`;
  }
  return 'A look from your closet';
}

/** A plain occasion tag for a proposed look, from the intent. */
function outfitOccasion(intent: OviIntent): string {
  return intent === 'today' ? 'today' : 'everyday';
}

/**
 * Assemble a coherent look from real closet pieces. Slots fill in order: base
 * (top/dress), bottom (unless the base is a dress), shoes, outerwear (only when
 * the weather calls for it), and one accessory. When `itemContext` is given the
 * focal piece is included and the look is built around it. Every returned id is
 * a real input item; nothing is fabricated.
 */
function composeStyling(input: ComposeOutfitInput): OviResponse {
  const { items, itemContext } = input;
  const profile = input.profile;
  const palette = buildPaletteSet(profile?.palette ?? []);
  const weather = input.weather ?? null;
  const wornIds = recentlyWornIds(input.wearLogs ?? []);

  const selected: OviItem[] = [];
  const usedIds = new Set<string>();
  const take = (item: OviItem | undefined): void => {
    if (item && !usedIds.has(item.id)) {
      selected.push(item);
      usedIds.add(item.id);
    }
  };
  const availableIn = (categories: readonly string[]): OviItem[] =>
    items.filter((item) => categories.includes(item.category) && !usedIds.has(item.id));

  // Focal piece (style_item): include it first, then build the rest around it.
  const focal = itemContext ? items.find((item) => item.id === itemContext) : undefined;
  take(focal);

  // Base: the focal if it can anchor, else the best top/dress.
  let base: OviItem | undefined;
  if (focal && (BASE_CATEGORIES as readonly string[]).includes(focal.category)) {
    base = focal;
  } else {
    base = pickBest(availableIn(BASE_CATEGORIES), palette, wornIds);
    take(base);
  }
  const baseIsDress = base?.category === 'dress';

  // Bottom: only when the base is not a dress.
  let bottom: OviItem | undefined;
  if (!baseIsDress) {
    if (focal?.category === BOTTOM_CATEGORY) {
      bottom = focal;
    } else {
      bottom = pickBest(availableIn([BOTTOM_CATEGORY]), palette, wornIds);
      take(bottom);
    }
  }

  // A look must at least anchor: a base, plus a bottom unless it's a dress.
  const buildable = base !== undefined && (baseIsDress || bottom !== undefined);
  if (!buildable) {
    return {
      reply: strings.ovi.sparseCloset,
      outfit: null,
    };
  }

  // Shoes: nice to have, not required.
  if (focal?.category === SHOES_CATEGORY) {
    // already taken
  } else {
    take(pickBest(availableIn([SHOES_CATEGORY]), palette, wornIds));
  }

  // Outerwear only when the weather asks for it.
  if (wantsOuterwear(weather) && focal?.category !== OUTERWEAR_CATEGORY) {
    take(pickBest(availableIn([OUTERWEAR_CATEGORY]), palette, wornIds));
  }

  // One finishing accessory, if the focal isn't already one.
  if (!(focal && (ACCESSORY_CATEGORIES as readonly string[]).includes(focal.category))) {
    take(pickBest(availableIn(ACCESSORY_CATEGORIES), palette, wornIds));
  }

  const pieces = selected.map(describePiece);
  const rationaleLead =
    pieces.length > 1
      ? `I anchored it on ${pieces[0]} and pulled the rest to match.${weatherClause(weather)}`
      : `Built around ${pieces[0]}.${weatherClause(weather)}`;
  // Close on the trust rule, verbatim from Quill's deck: every deterministic
  // look is built entirely from the closet, so Ovi says so and keeps buying honest.
  const rationale = `${rationaleLead} ${strings.ovi.shopHonesty}`;

  // Trim the greeting to its opening beat (drop the "— …" tail), but guard the
  // surgery: if the strip leaves too little, fall back to the full greeting so
  // the reply can't degrade to an empty or odd fragment.
  const trimmedGreeting = strings.ovi.greeting.replace(/—.*/, '').trim();
  const greeting = trimmedGreeting.length >= 3 ? trimmedGreeting : strings.ovi.greeting;
  const reply = focal
    ? "Here's a look I built around that piece — all from your closet."
    : `${greeting} — here's a look from your closet.`;

  return {
    reply,
    outfit: {
      name: outfitName(profile, input.intent),
      occasion: outfitOccasion(input.intent),
      itemIds: selected.map((item) => item.id),
      rationale,
    },
  };
}

/**
 * The single biggest hole in the essentials for a closet: the essential
 * category with the fewest pieces (ties broken by {@link ESSENTIAL_CATEGORIES}
 * order, so a missing pair of shoes reads first). Pure and total — an empty
 * closet returns the first essential. Shared by Ovi's "what's missing" answer
 * and the Shop ranker's `fills_gap` signal (`@era/core/shop`).
 */
export function biggestEssentialGap(items: readonly OviItem[]): string {
  const counts = new Map<string, number>();
  for (const category of ESSENTIAL_CATEGORIES) {
    counts.set(category, 0);
  }
  for (const item of items) {
    if (counts.has(item.category)) {
      counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
    }
  }

  // Biggest gap = lowest count; ties broken by ESSENTIAL_CATEGORIES order.
  let gap: string = ESSENTIAL_CATEGORIES[0];
  let gapCount = counts.get(gap) ?? 0;
  for (const category of ESSENTIAL_CATEGORIES) {
    const count = counts.get(category) ?? 0;
    if (count < gapCount) {
      gap = category;
      gapCount = count;
    }
  }
  return gap;
}

/**
 * Honest gap-finder for a "what am I missing" ask. Names the single biggest hole
 * in the essentials (a category with nothing, else the thinnest), in Ovi's voice
 * — an observation, not a nudge to buy. Returns no outfit.
 */
function composeWhatsMissing(items: readonly OviItem[], profile: StyleProfileLite | null): OviResponse {
  if (items.length === 0) {
    return { reply: strings.closet.empty, outfit: null };
  }

  const gap = biggestEssentialGap(items);

  // Route the gap line through Quill's curated trust-rule string rather than
  // inline prose: it names the thin category and keeps buying optional.
  const label = strings.closet.categoryLabel(gap).toLowerCase();
  const reply = strings.ovi.gapHonest(label);

  // profile is accepted for symmetry with the styling path and future tuning.
  void profile;
  return { reply, outfit: null };
}

/**
 * The deterministic stylist. Routes a "what's missing" ask to the honest
 * gap-finder and every styling ask to the closet composer. Pure and total:
 * unknown ids and empty closets resolve to an honest reply, never a throw and
 * never a fabricated item.
 */
export function composeOutfit(input: ComposeOutfitInput): OviResponse {
  if (input.intent === 'whats_missing') {
    return composeWhatsMissing(input.items, input.profile);
  }
  return composeStyling(input);
}
