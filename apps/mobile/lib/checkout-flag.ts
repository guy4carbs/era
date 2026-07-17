/**
 * Era mobile — the in-flow checkout feature flag + retailer allowlist (cosmetic
 * client gate).
 *
 * Answers two questions for the mobile client: "should we render the cross-store
 * cart + single-checkout surface at all?" and "which of a card's retailers may
 * show the in-flow 'Add to cart' affordance?" The first is read from
 * `EXPO_PUBLIC_ERA_CHECKOUT_ENABLED` and judged by {@link isEraCheckoutEnabled}
 * (exact-string 'true' discipline), so web and mobile decide the same way. The
 * second is read from `EXPO_PUBLIC_ERA_CHECKOUT_RETAILERS` and parsed by
 * {@link parseCheckoutRetailers} into the operator's sandbox-verified allowlist —
 * the SAME honesty control the server re-applies. A deliberate clone of
 * {@link eraTryonEnabled} in `lib/tryon-flag.ts`.
 *
 * BOTH are COSMETIC — they only decide what UI to render. The server's
 * `ERA_CHECKOUT_ENABLED` is the real gate (with it off every cart/checkout API
 * route 404s and no order is ever created), and the server re-checks the retailer
 * allowlist on every checkout, so a fat-fingered client flag can never actually
 * open the feature, place an order, or bill a card. Read once at module load — the
 * env vars are inlined at build time, so neither changes within a running app.
 */
import { checkoutSupportFor, parseCheckoutRetailers } from '@era/core/checkout';
import type { CheckoutSupport } from '@era/core/checkout';
import { isEraCheckoutEnabled } from '@era/core/checkout-flags';
import type { ShopProduct } from '@era/core/shop';

/** The two fields {@link checkoutSupportFor} actually reads off a product. */
type CheckoutSupportInput = Pick<ShopProduct, 'retailer' | 'productUrl'>;

/**
 * True only when this build was given `EXPO_PUBLIC_ERA_CHECKOUT_ENABLED=true`.
 * Cosmetic; see the module doc. Gates whether the cart entry point, the cart
 * sheet, and the checkout settings rows render at all.
 */
export const eraCheckoutEnabled: boolean = isEraCheckoutEnabled(
  process.env.EXPO_PUBLIC_ERA_CHECKOUT_ENABLED,
);

/**
 * The normalized, operator-sandbox-verified retailer allowlist this build was
 * given via `EXPO_PUBLIC_ERA_CHECKOUT_RETAILERS`. Empty (the safe default) makes
 * every product hand off — no card shows an in-flow affordance until the operator
 * lists a retailer they've verified end-to-end. Mirrors the server's
 * `ERA_CHECKOUT_RETAILERS`.
 */
export const checkoutRetailers: readonly string[] = parseCheckoutRetailers(
  process.env.EXPO_PUBLIC_ERA_CHECKOUT_RETAILERS,
);

/**
 * Whether a product may be bought in-flow on THIS build — the cosmetic affordance
 * decision for a Shop card. `handoff` whenever the surface is off, so a disabled
 * build always keeps the unchanged affiliate tap-out (and every card stays
 * byte-identical to the pre-checkout layout — the regression bar). When enabled,
 * defers to the shared {@link checkoutSupportFor} against the build's allowlist so
 * the client and server agree on which retailers are in-flow. The server re-gates
 * on the actual checkout call regardless. Accepts the minimal `{ retailer,
 * productUrl }` shape both the ranked feed's `RankedProduct` and the leaner
 * `SavedShopProduct` satisfy; the cast is safe because `checkoutSupportFor` reads
 * only those two fields.
 */
export function cardCheckoutSupport(product: CheckoutSupportInput): CheckoutSupport {
  if (!eraCheckoutEnabled) return 'handoff';
  return checkoutSupportFor(product as ShopProduct, checkoutRetailers);
}
