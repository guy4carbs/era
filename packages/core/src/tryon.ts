/**
 * @era/core — the avatar / virtual try-on wire contract + garment-chain planner.
 * PURE, ZERO deps.
 *
 * Virtual try-on renders a saved outfit onto a user's consented avatar. FASHN's
 * try-on API renders ONE garment per call and chains them (the output of call N is
 * the person input of call N+1), so an outfit has to be reduced to an ORDERED,
 * DEDUPLICATED, base-layer-first sequence of garments before any call is made.
 * This module is the single shared surface across the tiers: both clients CONSUME
 * the state shapes, and the server drives chain execution from {@link
 * planTryonChain} and keys render staleness off {@link itemsSignature}. Pinning
 * the plan here means the selection rule (which pieces get rendered, in what order)
 * and the staleness key can't drift between the job that renders and the sheet that
 * displays it.
 *
 * Dependency-free (no db, no image SDK, no zod) so it is safe in a client bundle;
 * nothing here carries a credential or a signed URL. Import via the
 * `@era/core/tryon` subpath.
 */

/**
 * The garment categories try-on renders, in the order a chain layers them onto the
 * avatar (base pieces first, then outerwear over them, then shoes). This is a
 * deliberately NARROW subset of the eleven-value `item_category` enum: the honest
 * v1 scope. The skipped categories — bag, hat, scarf, watch, jewelry, accessory —
 * are left out on purpose: today's try-on models place worn garments (tops,
 * bottoms, dresses, outerwear, shoes) reliably but are unreliable on small
 * accessories, so rendering them would degrade the result rather than complete it.
 * Keeping the list here as the ONE source of truth means {@link TryonCategory} and
 * the planner derive from the same place.
 *
 * `dress` and `top`+`bottom` are mutually exclusive base layers — the planner
 * resolves that (a dress wins); the ORDER in this tuple is the layer order the
 * chain follows once the base is chosen.
 */
export const TRYON_CATEGORIES = ['dress', 'top', 'bottom', 'outerwear', 'shoes'] as const;

/** One of the renderable try-on categories — the element type of {@link TRYON_CATEGORIES}. */
export type TryonCategory = (typeof TRYON_CATEGORIES)[number];

/**
 * The categories that can anchor a look as the base layer. A dress is a complete
 * base on its own; a top pairs with a bottom. The planner treats these as
 * mutually exclusive — see {@link planTryonChain}.
 */
const BASE_DRESS: TryonCategory = 'dress';
const BASE_TOP: TryonCategory = 'top';
const BASE_BOTTOM: TryonCategory = 'bottom';

/**
 * One item as the planner sees it. `id` is the item uuid (what the staleness
 * signature is built from); `category` is its raw `item_category` slug (any of the
 * eleven enum values — the planner filters to the renderable {@link
 * TRYON_CATEGORIES} itself, so a non-renderable slug is simply skipped rather than
 * rejected); `layerOrder` is the outfit's per-item `layer_order`, used only as the
 * deterministic tiebreak when an outfit holds two pieces of the same category.
 */
export interface TryonInputItem {
  readonly id: string;
  readonly category: string;
  readonly layerOrder: number;
}

/**
 * One garment in a resolved try-on chain: the item to render and the category slot
 * it fills. The server renders these in array order, feeding each call's output as
 * the next call's person input.
 */
export interface GarmentStep {
  readonly id: string;
  readonly category: TryonCategory;
}

/** Where a user's avatar stands. Mirrors the `avatar_status` enum plus `none`. */
export type AvatarStatus = 'none' | 'creating' | 'ready' | 'failed';

/**
 * The GET payload for a user's avatar. `none` — no avatar (or the surface is gated
 * off); `creating` — model creation in flight; `ready` — usable, `previewUrl` is a
 * short-lived signed GET of the avatar image (null while none is resolvable);
 * `failed` — creation errored and is retryable. `createdAt` is an ISO timestamp,
 * present once a row exists.
 */
export interface AvatarState {
  readonly status: AvatarStatus;
  readonly createdAt?: string;
  readonly previewUrl?: string | null;
}

/** Where one outfit's try-on render stands. Mirrors the `tryon_status` enum plus `none`. */
export type TryonStatus = 'none' | 'running' | 'complete' | 'failed';

/**
 * The GET payload for an outfit's try-on render — everything the try-on sheet needs
 * in one shape. `status` drives the UI state; `imageUrl` is a short-lived signed
 * GET of the finished render (null until one exists); `stale` is true when the
 * outfit's current garment selection no longer matches the {@link itemsSignature}
 * the stored render was built from (the outfit changed since it was rendered) — the
 * client offers an explicit "update render" rather than auto-spending a credit;
 * `garmentsRendered`/`garmentsTotal` drive the partial-progress line (a chain can
 * complete with fewer rendered than total when a middle step fails but the base
 * layer succeeded).
 */
export interface TryonState {
  readonly status: TryonStatus;
  readonly imageUrl: string | null;
  readonly stale: boolean;
  readonly garmentsRendered: number;
  readonly garmentsTotal: number;
}

/** True when `category` is one of the renderable try-on categories. */
function isTryonCategory(category: string): category is TryonCategory {
  return (TRYON_CATEGORIES as readonly string[]).includes(category);
}

/**
 * Pick the single winning item for a category from a list of same-category
 * candidates: LOWEST `layerOrder` wins, and the item `id` breaks a `layerOrder`
 * tie. Both keys make the choice fully deterministic — the same outfit always
 * yields the same chain (and therefore the same {@link itemsSignature}), never a
 * result that depends on input array order.
 */
function pickWinner(candidates: readonly TryonInputItem[]): TryonInputItem {
  return candidates.reduce((best, item) => {
    if (item.layerOrder !== best.layerOrder) {
      return item.layerOrder < best.layerOrder ? item : best;
    }
    return item.id < best.id ? item : best;
  });
}

/**
 * Reduce an outfit's items to the ordered try-on chain the server renders.
 *
 * Selection rules, in order:
 *   1. Keep only renderable categories ({@link TRYON_CATEGORIES}); every skipped
 *      category (bag/hat/scarf/watch/jewelry/accessory) drops out here.
 *   2. Per category, if the outfit holds more than one piece, {@link pickWinner}
 *      collapses it to one (lowest `layerOrder`, id tiebreak) — deterministic.
 *   3. Base layer is dress XOR (top + bottom): a dress present WINS and the top and
 *      bottom are skipped (you don't render a top over a dress); with no dress, the
 *      top and/or bottom stand as the base.
 *   4. Then outerwear, then shoes.
 *
 * Chain order is base-layers-first — `[dress]` or `[top, bottom]`, then
 * `outerwear`, then `shoes` — because each render call layers its garment onto the
 * previous call's output, so the pieces worn underneath must be placed first. The
 * chain is at most 4 steps (`top, bottom, outerwear, shoes`); a dress base caps it
 * at 3.
 *
 * Pure and total; never throws. An outfit with nothing renderable returns `[]`.
 */
export function planTryonChain(items: readonly TryonInputItem[]): GarmentStep[] {
  // Collapse each renderable category to its single deterministic winner.
  const byCategory = new Map<TryonCategory, TryonInputItem[]>();
  for (const item of items) {
    if (!isTryonCategory(item.category)) continue;
    const bucket = byCategory.get(item.category);
    if (bucket) bucket.push(item);
    else byCategory.set(item.category, [item]);
  }
  const winner = (category: TryonCategory): TryonInputItem | undefined => {
    const bucket = byCategory.get(category);
    return bucket ? pickWinner(bucket) : undefined;
  };

  // Base layer: a dress wins outright over a top+bottom pairing.
  const dress = winner(BASE_DRESS);
  const baseOrder: TryonCategory[] = dress ? [BASE_DRESS] : [BASE_TOP, BASE_BOTTOM];

  // Full layer order: base first, then outerwear, then shoes.
  const order: TryonCategory[] = [...baseOrder, 'outerwear', 'shoes'];

  const chain: GarmentStep[] = [];
  for (const category of order) {
    const item = winner(category);
    if (item) chain.push({ id: item.id, category });
  }
  return chain;
}

/**
 * The staleness key for a stored render: the SELECTED items' uuids (exactly the
 * ones {@link planTryonChain} would render), sorted and ':'-joined. The server
 * stores this alongside a render and compares it against a freshly-computed one to
 * decide whether the outfit has changed since it was rendered.
 *
 * Two deliberate properties make this the right key. It is built from the SELECTED
 * items only, so adding a skipped accessory (a hat, a bag) to the outfit does NOT
 * invalidate a render — nothing about the rendered image changed. And it is SORTED
 * (not chain-ordered), so it captures the SET of rendered garments, not their
 * placement: a canvas transform (moving, scaling, rotating a piece) never changes
 * which garments are worn, so it must never invalidate a paid render. `outfit_items`
 * carries no `updated_at` and the transforms live on that same row, which is
 * exactly why staleness is derived from this content signature rather than a
 * timestamp. Pure; never throws.
 */
export function itemsSignature(items: readonly TryonInputItem[]): string {
  return planTryonChain(items)
    .map((step) => step.id)
    .sort()
    .join(':');
}
