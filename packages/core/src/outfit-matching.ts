/**
 * @era/core — "shop similar from my closet". PURE, deterministic, NO LLM, no IO.
 *
 * When a viewer opens a feed post, this maps the posted look onto the pieces the
 * VIEWER already owns: for each posted item, which of the viewer's own items
 * would wear in its place. It's the trust rule carried into the feed — before
 * Shop ever suggests buying, Era shows what the closet already answers. Reuses
 * Ovi's {@link slotForCategory} and {@link normalizeColor} so the feed, Ovi, and
 * Shop all judge slots and color identically.
 *
 * Scoring per candidate (a viewer item sharing the posted item's slot):
 *   - same category            +3   (a top for a top beats a dress for a top)
 *   - each shared color         +2   (normalized; at most 2 colors counted)
 *   - same pattern              +1   (only when BOTH items define one)
 *   - same brand                +1   (both defined; case-insensitive, trimmed)
 * Zero-score candidates are excluded; the top 3 per slot are returned, ties
 * broken by item id ascending so the order is total and stable. `reasons` are
 * machine-readable strings ('same category', 'shares color: black', …) a client
 * renders however it likes.
 *
 * No server-only imports, so this subpath is client-safe. The SERVER resolves
 * each returned item's display/cutout URL from the DB before the payload ships —
 * this module never touches storage. Import via the `@era/core/outfit-matching`
 * subpath.
 */

import { normalizeColor, slotForCategory, type OutfitSlot, type OviItem } from './ovi.ts';

/** Score weights. Category dominates; color is the next strongest signal. */
const WEIGHT_SAME_CATEGORY = 3;
const WEIGHT_SHARED_COLOR = 2;
const WEIGHT_SAME_PATTERN = 1;
const WEIGHT_SAME_BRAND = 1;

/** At most this many shared colors contribute to the score (and to `reasons`). */
const MAX_COLORS_COUNTED = 2;

/** How many viewer items are returned per posted item. */
const MAX_MATCHES_PER_SLOT = 3;

/**
 * One owned viewer item matched to a posted item, with its deterministic score
 * and the machine-readable `reasons` behind it (stable order: category, then each
 * shared color, then pattern, then brand). A client turns the reasons into copy;
 * they never carry a storage key.
 */
export interface ScoredClosetMatch {
  readonly item: OviItem;
  readonly score: number;
  readonly reasons: readonly string[];
}

/**
 * The viewer's matches for ONE posted item. `slot` is the posted item's outfit
 * slot ({@link slotForCategory}); `posted` is the item from the feed look;
 * `matches` are the viewer's own top-scoring pieces for that slot (empty when the
 * closet has nothing scoring in the slot). One SlotMatch is produced per posted
 * item with a non-null slot — two posted items in the same slot yield two
 * SlotMatches, each keyed by its own posted item.
 */
export interface SlotMatch {
  readonly slot: OutfitSlot;
  readonly posted: OviItem;
  readonly matches: readonly ScoredClosetMatch[];
}

/** A brand key for case-insensitive, whitespace-trimmed comparison; null when unset. */
function brandKey(brand: string | null): string | null {
  if (brand === null) {
    return null;
  }
  const trimmed = brand.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * The normalized colors shared by two items, in the posted item's color order,
 * deduped, and capped at {@link MAX_COLORS_COUNTED}. Normalization strips a
 * leading `#` and lowercases (via {@link normalizeColor}), so 'Black' matches
 * 'black' but NOT '#000'.
 */
function sharedColors(posted: OviItem, candidate: OviItem): string[] {
  const candidateColors = new Set(candidate.colors.map(normalizeColor));
  const shared: string[] = [];
  const seen = new Set<string>();
  for (const color of posted.colors) {
    const norm = normalizeColor(color);
    if (candidateColors.has(norm) && !seen.has(norm)) {
      seen.add(norm);
      shared.push(norm);
      if (shared.length >= MAX_COLORS_COUNTED) {
        break;
      }
    }
  }
  return shared;
}

/**
 * Score one viewer item against a posted item, returning the scored match or null
 * when nothing lines up (a zero score is excluded). Reasons are built in a stable
 * order so the output is deterministic and diff-friendly.
 */
function scoreCandidate(posted: OviItem, candidate: OviItem): ScoredClosetMatch | null {
  let score = 0;
  const reasons: string[] = [];

  if (candidate.category === posted.category) {
    score += WEIGHT_SAME_CATEGORY;
    reasons.push('same category');
  }

  for (const color of sharedColors(posted, candidate)) {
    score += WEIGHT_SHARED_COLOR;
    reasons.push(`shares color: ${color}`);
  }

  if (posted.pattern !== null && candidate.pattern !== null && posted.pattern === candidate.pattern) {
    score += WEIGHT_SAME_PATTERN;
    reasons.push('same pattern');
  }

  const postedBrand = brandKey(posted.brand);
  const candidateBrand = brandKey(candidate.brand);
  if (postedBrand !== null && candidateBrand !== null && postedBrand === candidateBrand) {
    score += WEIGHT_SAME_BRAND;
    reasons.push('same brand');
  }

  if (score <= 0) {
    return null;
  }
  return { item: candidate, score, reasons };
}

/**
 * Map a posted look onto the viewer's closet, one {@link SlotMatch} per posted
 * item that occupies an outfit slot. For each such item, every viewer item in the
 * same slot is scored; zero-score items are dropped, the rest sorted by score
 * descending (ties broken by item id ascending) and capped at the top
 * {@link MAX_MATCHES_PER_SLOT}. Posted items whose category maps to no slot
 * (`slotForCategory` returns null) are skipped entirely.
 *
 * Pure and total — an empty closet yields SlotMatches with empty `matches`, never
 * a throw. Only the viewer's own items appear in the result; the posted items are
 * echoed back unchanged as the `posted` key.
 */
export function matchOutfitToCloset(
  postedItems: readonly OviItem[],
  viewerCloset: readonly OviItem[],
): readonly SlotMatch[] {
  const result: SlotMatch[] = [];

  for (const posted of postedItems) {
    const slot = slotForCategory(posted.category);
    if (slot === null) {
      continue;
    }

    const matches = viewerCloset
      .filter((candidate) => slotForCategory(candidate.category) === slot)
      .map((candidate) => scoreCandidate(posted, candidate))
      .filter((match): match is ScoredClosetMatch => match !== null)
      .sort((a, b) => (b.score !== a.score ? b.score - a.score : a.item.id < b.item.id ? -1 : a.item.id > b.item.id ? 1 : 0))
      .slice(0, MAX_MATCHES_PER_SLOT);

    result.push({ slot, posted, matches });
  }

  return result;
}
