/**
 * @era/core — the wardrobe-gap engine. Client-safe, deterministic, model-free.
 *
 * Ovi's trust rule made structural: only flag buying for a GENUINE gap — an
 * essential category whose shortfall actually limits the outfits the closet can
 * build — and never for a category the closet already covers. This is the honest
 * counterpart to `@era/core/shop`'s ranker: where the ranker scores a given
 * product against the closet, this finds the holes worth shopping for in the
 * first place, and hands each one a pre-filtered {@link ShopSearchQuery} that
 * drops the user straight into a Shop search for the piece that unblocks the most
 * outfits.
 *
 * The engine is restrained by design. A well-covered closet returns FEW gaps or
 * NONE — it never manufactures one. It reuses Ovi's slot/essentials primitives
 * (`slotForCategory`, `ESSENTIAL_CATEGORIES`) and mirrors the Shop ranker's
 * outfit-completion math so the two surfaces agree on what "a new outfit" means.
 *
 * `reason` stays OUT of here on purpose: this module returns structured data
 * (category / ownedCount / unlocksOutfits / pairsWith) and the UI renders the
 * honest sentence from Quill's strings. No copy, no server imports (no DB, no R2)
 * — safe in a client bundle.
 *
 * Import via the `@era/core/shop` subpath (re-exported alongside the ranker) or
 * the dedicated `@era/core/wardrobe-gaps` subpath.
 */

import { ESSENTIAL_CATEGORIES, type OviItem, type StyleProfileLite, type WearLogLite } from './ovi.ts';
import type { BrandTier, ItemCategory, ShopSearchQuery } from './shop.ts';

// -----------------------------------------------------------------------------
// Contract type — what Forge routes, Nova/Harbor render, and Quill narrates
// -----------------------------------------------------------------------------

/**
 * One genuine wardrobe gap. Pure structured data — the UI composes the honest
 * reason ("a bottom would pair with your 6 tops") from these fields via Quill's
 * strings; no prose lives here.
 *   - `category`     — the essential category the closet is short in.
 *   - `ownedCount`   — how many of that category the closet already holds.
 *   - `unlocksOutfits` — new buildable looks from adding ONE item of `category`.
 *   - `pairsWith`    — the owned categories those new looks combine with (the
 *     honest "pairs with your …" reasoning); empty for a self-anchoring piece.
 *   - `suggestedQuery` — a pre-filtered Shop search: the gap `category`, plus a
 *     `brandTier` when the style profile clearly implies one.
 *   - `score`        — the deterministic rank; higher surfaces first.
 */
export interface WardrobeGap {
  readonly category: ItemCategory;
  readonly ownedCount: number;
  readonly unlocksOutfits: number;
  readonly pairsWith: readonly ItemCategory[];
  readonly suggestedQuery: ShopSearchQuery;
  readonly score: number;
}

// -----------------------------------------------------------------------------
// Scoring — unlocks dominate; wear breaks near-ties; essentials order is the
// final tiebreak so a well-worn slot and a structurally-important slot both win
// the coin toss when the raw outfit math is level.
// -----------------------------------------------------------------------------

/** Each outfit a gap unlocks is the primary signal — it dwarfs the tiebreaks. */
const SCORE_PER_UNLOCK = 100;
/** A wear in the gap's slot is a real nudge — enough to reorder equal-unlock gaps. */
const SCORE_PER_WEAR = 10;

/** At most this many gaps surface — restraint over a wall of suggestions. */
const MAX_GAPS = 5;

/** Categories that anchor a look, for the pairs-with reasoning on a finisher gap. */
const TOP: ItemCategory = 'top';
const BOTTOM: ItemCategory = 'bottom';
const DRESS: ItemCategory = 'dress';

// -----------------------------------------------------------------------------
// Style-profile → budget tier. Conservative: only a clear signal sets a tier;
// otherwise the suggested query carries the category alone (all prices).
// -----------------------------------------------------------------------------

/** Ordered keyword→tier signals; the first match on the profile wins. */
const TIER_SIGNALS: readonly (readonly [signal: string, tier: BrandTier])[] = [
  ['luxury', 'luxury'],
  ['elevated', 'premium'],
  ['premium', 'premium'],
  ['refined', 'premium'],
  ['tailored', 'premium'],
  ['contemporary', 'contemporary'],
  ['minimalist', 'contemporary'],
  ['affordable', 'high_street'],
  ['budget', 'high_street'],
  ['high street', 'high_street'],
];

/**
 * Infer a budget tier from the style profile, or undefined when nothing in the
 * archetype or keywords clearly implies one. Case-insensitive, first-match wins.
 */
function inferBrandTier(profile: StyleProfileLite | null): BrandTier | undefined {
  if (!profile) {
    return undefined;
  }
  const haystack = [profile.archetype, ...profile.keywords].join(' ').toLowerCase();
  for (const [signal, tier] of TIER_SIGNALS) {
    if (haystack.includes(signal)) {
      return tier;
    }
  }
  return undefined;
}

/** The pre-filtered Shop query for a gap: the category, plus a tier when implied. */
function buildQuery(category: ItemCategory, profile: StyleProfileLite | null): ShopSearchQuery {
  const brandTier = inferBrandTier(profile);
  return brandTier !== undefined ? { category, brandTier } : { category };
}

// -----------------------------------------------------------------------------
// Closet tallies
// -----------------------------------------------------------------------------

/** Owned count per category. */
function ownedByCategory(closet: readonly OviItem[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of closet) {
    counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
  }
  return counts;
}

/**
 * How many times each category was worn, resolving each wear-logged item id back
 * to its category via the closet. Ids no longer in the closet are ignored. An
 * empty/absent log yields an empty map — the caller then ranks on essentials
 * order alone.
 */
function wornByCategory(closet: readonly OviItem[], wearLogs: readonly WearLogLite[]): Map<string, number> {
  const categoryOf = new Map(closet.map((item) => [item.id, item.category]));
  const counts = new Map<string, number>();
  for (const log of wearLogs) {
    for (const id of log.itemIds) {
      const category = categoryOf.get(id);
      if (category !== undefined) {
        counts.set(category, (counts.get(category) ?? 0) + 1);
      }
    }
  }
  return counts;
}

// -----------------------------------------------------------------------------
// Per-category gap math — the DELTA in buildable looks from adding ONE piece,
// mirroring `@era/core/shop`'s completableLooks so the two surfaces agree.
// -----------------------------------------------------------------------------

/** The unlock + pairing for one candidate category, before scoring. */
interface GapMath {
  readonly unlocksOutfits: number;
  readonly pairsWith: readonly ItemCategory[];
}

/**
 * The outfits adding ONE item of `category` would unlock, and the owned
 * categories those looks lean on:
 *   - `bottom` — a genuine gap only when bottoms are scarcer than tops; adding
 *     one pairs with every owned top → #tops new looks (pairs with `top`).
 *   - `top` — symmetric: a gap only when tops are scarcer than bottoms → #bottoms
 *     (pairs with `bottom`).
 *   - `shoes` / `outerwear` — finishers: a gap only when the closet owns NONE
 *     (going 0→1 makes every already-anchorable look wearable/layerable; owning
 *     one already covers them all, so 1→N unlocks nothing). Unlocks the count of
 *     anchorable looks (owned dresses + owned top×bottom pairs).
 * A balanced closet (tops == bottoms, ≥1 of each finisher) yields 0 everywhere —
 * no manufactured gaps.
 */
function gapMath(category: ItemCategory, owned: number, tops: number, bottoms: number, dresses: number): GapMath {
  if (category === BOTTOM) {
    if (bottoms < tops) {
      return { unlocksOutfits: tops, pairsWith: [TOP] };
    }
    return { unlocksOutfits: 0, pairsWith: [] };
  }
  if (category === TOP) {
    if (tops < bottoms) {
      return { unlocksOutfits: bottoms, pairsWith: [BOTTOM] };
    }
    return { unlocksOutfits: 0, pairsWith: [] };
  }
  // Finisher (shoes / outerwear): only a gap when the closet owns none.
  if (owned > 0) {
    return { unlocksOutfits: 0, pairsWith: [] };
  }
  const anchored = dresses + tops * bottoms;
  const pairsWith: ItemCategory[] = [];
  if (dresses > 0) {
    pairsWith.push(DRESS);
  }
  if (tops > 0 && bottoms > 0) {
    pairsWith.push(TOP, BOTTOM);
  }
  return { unlocksOutfits: anchored, pairsWith };
}

// -----------------------------------------------------------------------------
// The engine
// -----------------------------------------------------------------------------

/**
 * Find the genuine wardrobe gaps for a closet: the essential categories whose
 * shortfall actually limits the outfits the closet can build, each with the
 * outfits it would unlock, the owned pieces it pairs with, a pre-filtered Shop
 * query, and a deterministic score.
 *
 * Restraint is the rule: a candidate that unlocks 0 new outfits is NOT a gap and
 * is dropped, so a well-covered closet returns few gaps or none. At most
 * {@link MAX_GAPS} are returned, sorted by `score` descending (input/essentials
 * order breaks ties). Pure and total — an empty or fully-covered closet returns
 * an empty array, never a throw and never an invented gap.
 *
 * Scoring folds three signals in strict precedence: the outfits unlocked
 * (×{@link SCORE_PER_UNLOCK}, dominant), then how often the gap's category is
 * actually worn (×{@link SCORE_PER_WEAR}, when `wearLogs` are supplied), then the
 * essentials order (a small constant tiebreak). With no wear data the wear term
 * is zero and ranking falls back to unlocks + essentials order.
 */
export function findWardrobeGaps(
  closet: readonly OviItem[],
  styleProfile: StyleProfileLite | null,
  wearLogs?: readonly WearLogLite[],
): readonly WardrobeGap[] {
  const owned = ownedByCategory(closet);
  const worn = wornByCategory(closet, wearLogs ?? []);
  const tops = owned.get(TOP) ?? 0;
  const bottoms = owned.get(BOTTOM) ?? 0;
  const dresses = owned.get(DRESS) ?? 0;

  const gaps: WardrobeGap[] = [];
  ESSENTIAL_CATEGORIES.forEach((category, index) => {
    const ownedCount = owned.get(category) ?? 0;
    const { unlocksOutfits, pairsWith } = gapMath(category, ownedCount, tops, bottoms, dresses);
    if (unlocksOutfits <= 0) {
      return;
    }
    // Essentials order is the final tiebreak: earlier categories score a touch
    // higher (bounded below SCORE_PER_WEAR so wear and unlocks still lead).
    const essentialsBonus = ESSENTIAL_CATEGORIES.length - 1 - index;
    const wornCount = worn.get(category) ?? 0;
    const score = unlocksOutfits * SCORE_PER_UNLOCK + wornCount * SCORE_PER_WEAR + essentialsBonus;
    gaps.push({
      category,
      ownedCount,
      unlocksOutfits,
      pairsWith,
      suggestedQuery: buildQuery(category, styleProfile),
      score,
    });
  });

  return gaps.sort((a, b) => b.score - a.score).slice(0, MAX_GAPS);
}
