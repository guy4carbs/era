/**
 * Server-only selection of the checkout backend — the single decision point that
 * hands routes either the live Rye adapter or the deterministic fixture provider,
 * both behind the ONE `@era/core/checkout` `CheckoutProvider` contract.
 *
 * `getCheckoutProvider()` returns the Rye provider ONLY when a real `RYE_API_KEY` is
 * present (`isRyeConfigured`); otherwise the offline fixture — the $0 CI/E2E vehicle
 * that proves the whole create→offer→confirm flow with no network, no key, no spend.
 * This mirrors `getShopProvider()`: a placeholder key must never fire a request that
 * can only fail.
 *
 * The two providers differ in exactly ONE way — `supports()`:
 *   - the RYE provider is ALLOWLIST-driven: a product is in-flow only when its
 *     retailer is on the operator-verified `ERA_CHECKOUT_RETAILERS` list AND its
 *     productUrl is https (`checkoutSupportFor`). Empty allowlist ⇒ everything hands
 *     off — the honesty control.
 *   - the FIXTURE provider keeps its own always-'Fixture' `supports()` (from
 *     `createFixtureCheckoutProvider`) so CI/dev flows work with ZERO env.
 *
 * The Rye provider wraps the low-level `rye.ts` client (which returns
 * `CheckoutIntent | null`) into the async `CheckoutProvider` surface by THROWING on a
 * null — symmetric with the fixture's reject-on-unknown-id — so the batch orchestrator
 * (`checkout-server.ts`) catches a per-order vendor failure and marks that one row
 * failed while the rest of the batch proceeds.
 *
 * Never import this from a client bundle — it constructs the credential-holding client.
 */
import {
  type CheckoutIntent,
  type CheckoutPayment,
  type CheckoutProvider,
  type CheckoutSupport,
  type CreateCheckoutIntentInput,
  checkoutSupportFor,
  createFixtureCheckoutProvider,
  parseCheckoutRetailers,
} from '@era/core/checkout';
import { isEraCheckoutEnabled } from '@era/core/checkout-flags';
import type { ShopProduct } from '@era/core/shop';

import { createRyeCheckoutClient, isRyeConfigured, ryeApiBase } from './rye.ts';

/**
 * Server-authoritative master flag for the entire in-flow checkout surface, read RAW
 * from `ERA_CHECKOUT_ENABLED` (NOT through the zod schema, so a dormant feature never
 * blocks boot — the turnaround / try-on precedent). True ONLY for the exact string
 * 'true'. When false, every cart + checkout API route 404s and no intent is created.
 */
export function isCheckoutEnabledServer(): boolean {
  return isEraCheckoutEnabled(process.env.ERA_CHECKOUT_ENABLED);
}

/**
 * The live Rye `CheckoutProvider`. `supports()` is allowlist-driven (no live probe);
 * the three async methods delegate to the bounded `rye.ts` client and throw on a null
 * so the orchestrator can fail that one order and continue the batch.
 */
function createRyeCheckoutProvider(apiKey: string): CheckoutProvider {
  const client = createRyeCheckoutClient(apiKey, ryeApiBase());
  const allowlist = parseCheckoutRetailers(process.env.ERA_CHECKOUT_RETAILERS);

  return {
    name: 'rye',

    supports(product: ShopProduct): CheckoutSupport {
      return checkoutSupportFor(product, allowlist);
    },

    async createIntent(input: CreateCheckoutIntentInput): Promise<CheckoutIntent> {
      const intent = await client.createIntent(input);
      if (intent === null) {
        throw new Error('rye createIntent failed');
      }
      return intent;
    },

    async getIntent(id: string): Promise<CheckoutIntent> {
      const intent = await client.getIntent(id);
      if (intent === null) {
        throw new Error('rye getIntent failed');
      }
      return intent;
    },

    async confirmIntent(id: string, payment: CheckoutPayment): Promise<CheckoutIntent> {
      const intent = await client.confirmIntent(id, payment);
      if (intent === null) {
        throw new Error('rye confirmIntent failed');
      }
      return intent;
    },
  };
}

/**
 * The single decision point for which checkout backend the routes use. Returns the
 * live Rye adapter ONLY when a real `RYE_API_KEY` is present; otherwise the offline
 * fixture provider (the live path in CI/dev). Called per-request — cheap, no I/O until
 * a method runs.
 */
export function getCheckoutProvider(): CheckoutProvider {
  const apiKey = process.env.RYE_API_KEY;
  if (isRyeConfigured() && apiKey) {
    return createRyeCheckoutProvider(apiKey);
  }
  return createFixtureCheckoutProvider();
}
