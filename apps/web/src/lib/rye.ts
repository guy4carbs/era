/**
 * Rye universal-checkout REST client — the in-flow checkout vendor seam.
 *
 * Rye (rye.com) places an order at a retailer on the buyer's behalf: Era sends the
 * buyer's name / shipping address / email / phone plus the product URL + quantity,
 * Rye resolves a real offer (subtotal + shipping + tax), and on confirm charges a
 * tokenized payment and places the order. One `checkout-intent` == one product
 * order at one retailer; Era's cross-store cart mints N sibling intents (one per
 * in-flow item) and folds them into a batch server-side (see `checkout-server.ts`).
 *
 * This module is the untrusted-boundary adapter that maps Rye's JSON onto the pinned
 * `@era/core/checkout` `CheckoutIntent` contract — the SAME posture as the Sovrn
 * shop adapter (`shop-provider.ts`): EVERY field off the wire is `unknown` until a
 * guard proves its shape, ANY unexpected response is a `null` result (never a throw
 * into the route), and a slow call is bounded by an 8s timeout. `checkout-provider.ts`
 * wraps this low-level client into a `CheckoutProvider` whose async methods throw on
 * a null so the orchestrator can mark that one order failed and continue the batch.
 *
 * SECURITY. `RYE_API_KEY` is server-only — it rides in an `Authorization: Bearer`
 * header and is NEVER logged, echoed, or returned to a client. Buyer PII (name,
 * address, email, phone) is marshalled to Rye here and never logged; on any failure
 * we log ONLY an HTTP status code or an error class, never a body, key, or PII.
 * `RYE_API_KEY` / `RYE_WEBHOOK_SECRET` are deliberately kept OUT of the zod env
 * schema (the turnaround / FASHN precedent) so a dormant feature never blocks boot.
 *
 * Never import this from a client bundle — it holds the vendor credential.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

import type {
  CheckoutBuyer,
  CheckoutIntent,
  CheckoutIntentState,
  CheckoutOffer,
  CheckoutPayment,
  CreateCheckoutIntentInput,
} from '@era/core/checkout';
import { subunitsToCents } from '@era/core/checkout';

/** The Rye API base for each environment. `ERA_CHECKOUT_SANDBOX==='true'` selects staging. */
const RYE_STAGING_BASE = 'https://staging.api.rye.com/api/v1';
const RYE_PROD_BASE = 'https://api.rye.com/api/v1';

/** Per-call wall budget — a slow Rye call must never hang a checkout request. */
const RYE_TIMEOUT_MS = 8_000;

/** The Rye checkout-intent lifecycle states we recognize — its vocabulary VERBATIM. */
const KNOWN_STATES: ReadonlySet<string> = new Set<CheckoutIntentState>([
  'retrieving_offer',
  'awaiting_confirmation',
  'requires_action',
  'placing_order',
  'completed',
  'failed',
]);

/**
 * True only for a real, operator-supplied credential. The committed `.env.example`
 * ships an obvious `change-me-…` placeholder; treating that as configured would fire
 * an authenticated request that can only fail. Mirrors `shop-provider.isRealCredential`.
 */
function isRealCredential(value: string | undefined): value is string {
  if (!value) {
    return false;
  }
  return !value.startsWith('change-me');
}

/** Whether the in-flow checkout adapter is provisioned (a real `RYE_API_KEY` is set). */
export function isRyeConfigured(): boolean {
  return isRealCredential(process.env.RYE_API_KEY);
}

/** Whether the Rye webhook endpoint is provisioned (a real `RYE_WEBHOOK_SECRET` is set). */
export function isRyeWebhookConfigured(): boolean {
  return isRealCredential(process.env.RYE_WEBHOOK_SECRET);
}

/** True when the checkout stack targets Rye's SANDBOX (staging API + test payment tokens). */
export function isCheckoutSandbox(): boolean {
  return process.env.ERA_CHECKOUT_SANDBOX === 'true';
}

/** The Rye environment tag persisted on an order row — 'sandbox' | 'production'. */
export function checkoutEnvironment(): 'sandbox' | 'production' {
  return isCheckoutSandbox() ? 'sandbox' : 'production';
}

/** The Rye API base for the current environment (staging under sandbox, prod otherwise). */
export function ryeApiBase(): string {
  return isCheckoutSandbox() ? RYE_STAGING_BASE : RYE_PROD_BASE;
}

// -----------------------------------------------------------------------------
// Boundary readers — every Rye field is `unknown` until a guard proves its shape.
// -----------------------------------------------------------------------------

/** A finite non-empty string off the wire, or null. */
function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Read a Rye `Money` (`{currencyCode, amountSubunits}`) into integer cents + currency,
 * or null when the shape is wrong. `subunitsToCents` throws for a non-2-decimal
 * currency (JPY, KWD…) — we don't support those yet — so a throw is caught here and
 * surfaces as a null (no offer), never a silently-wrong price.
 */
function readMoney(value: unknown): { cents: number; currency: string } | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const money = value as { currencyCode?: unknown; amountSubunits?: unknown };
  const currency = str(money.currencyCode);
  if (currency === null || typeof money.amountSubunits !== 'number') {
    return null;
  }
  try {
    return { cents: subunitsToCents(money.amountSubunits, currency), currency };
  } catch {
    return null;
  }
}

/**
 * Map Rye's `offer.cost` breakdown onto Era's {@link CheckoutOffer} (integer cents).
 * Rye's cost carries `total` + `subtotal` (both required) and optional `shipping` /
 * `tax`; a missing shipping/tax reads as 0, and a malformed/absent total or subtotal
 * yields `undefined` (the order stays pre-offer). Currency comes from the total.
 */
function mapOffer(rawOffer: unknown): CheckoutOffer | undefined {
  if (typeof rawOffer !== 'object' || rawOffer === null) {
    return undefined;
  }
  const cost = (rawOffer as { cost?: unknown }).cost;
  if (typeof cost !== 'object' || cost === null) {
    return undefined;
  }
  const c = cost as { total?: unknown; subtotal?: unknown; shipping?: unknown; tax?: unknown };
  const total = readMoney(c.total);
  const subtotal = readMoney(c.subtotal);
  if (total === null || subtotal === null) {
    return undefined;
  }
  const shipping = readMoney(c.shipping);
  const tax = readMoney(c.tax);
  return {
    subtotalCents: subtotal.cents,
    shippingCents: shipping?.cents ?? 0,
    taxCents: tax?.cents ?? 0,
    totalCents: total.cents,
    currency: total.currency,
  };
}

/**
 * Map a raw Rye checkout-intent JSON object onto the {@link CheckoutIntent} contract,
 * or null when the payload has no usable `id` (an unrecognizable shape). An unknown
 * `state` string maps to `'failed'` with a logged note (fail closed — never treat a
 * state we don't understand as success). Rye's `orderId` (present once completed) maps
 * to `vendorOrderId`; its `failureReason` object (`{message, code}`) maps to the short
 * machine `code`. No PII or key is ever logged here.
 */
function mapIntent(raw: unknown): CheckoutIntent | null {
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }
  const obj = raw as {
    id?: unknown;
    state?: unknown;
    offer?: unknown;
    orderId?: unknown;
    failureReason?: unknown;
  };
  const id = str(obj.id);
  if (id === null) {
    return null;
  }

  const rawState = str(obj.state);
  let state: CheckoutIntentState;
  if (rawState !== null && KNOWN_STATES.has(rawState)) {
    state = rawState as CheckoutIntentState;
  } else {
    console.error(`[era-checkout] Rye intent returned an unrecognized state; failing closed`);
    state = 'failed';
  }

  const intent: {
    id: string;
    state: CheckoutIntentState;
    offer?: CheckoutOffer;
    vendorOrderId?: string;
    failureReason?: string;
  } = { id, state };

  const offer = mapOffer(obj.offer);
  if (offer !== undefined) {
    intent.offer = offer;
  }

  const vendorOrderId = str(obj.orderId);
  if (vendorOrderId !== null) {
    intent.vendorOrderId = vendorOrderId;
  }

  // Rye's failureReason is an object {message, code}; keep only the machine code.
  // Tolerate a bare string defensively.
  const fr = obj.failureReason;
  if (typeof fr === 'string' && fr.length > 0) {
    intent.failureReason = fr;
  } else if (typeof fr === 'object' && fr !== null) {
    const code = str((fr as { code?: unknown }).code);
    if (code !== null) {
      intent.failureReason = code;
    }
  }

  return intent;
}

// -----------------------------------------------------------------------------
// Request marshalling — Era's contract → Rye's request body.
// -----------------------------------------------------------------------------

/** Marshal `@era/core` buyer PII onto Rye's `buyer` object (address2 omitted when blank). */
function ryeBuyer(buyer: CheckoutBuyer): Record<string, string> {
  const out: Record<string, string> = {
    firstName: buyer.firstName,
    lastName: buyer.lastName,
    email: buyer.email,
    address1: buyer.address1,
    city: buyer.city,
    province: buyer.province,
    postalCode: buyer.postalCode,
    country: buyer.country,
  };
  if (buyer.phone) {
    out.phone = buyer.phone;
  }
  if (buyer.address2) {
    out.address2 = buyer.address2;
  }
  return out;
}

/** Build the `POST /checkout-intents` body from the core create input. */
function createIntentBody(input: CreateCheckoutIntentInput): Record<string, unknown> {
  const body: Record<string, unknown> = {
    buyer: ryeBuyer(input.buyer),
    productUrl: input.productUrl,
    quantity: input.quantity,
  };
  if (input.referenceId) {
    body.referenceId = input.referenceId;
  }
  // Rye's variantSelections is an ARRAY of {label, value} — NOT a map — so convert
  // the core's opaque size/color record on the way out.
  if (input.variantSelections) {
    const selections = Object.entries(input.variantSelections).map(([label, value]) => ({ label, value }));
    if (selections.length > 0) {
      body.variantSelections = selections;
    }
  }
  // Rye's constraints.maxTotalPrice is a plain integer of subunits (== cents for a
  // 2-decimal currency), NOT a Money object — the price ceiling that stops a runaway
  // offer from auto-confirming.
  if (typeof input.maxTotalCents === 'number' && Number.isFinite(input.maxTotalCents)) {
    body.constraints = { maxTotalPrice: Math.ceil(input.maxTotalCents) };
  }
  return body;
}

// -----------------------------------------------------------------------------
// The client — three bounded, never-throwing calls returning CheckoutIntent | null.
// -----------------------------------------------------------------------------

/** The low-level Rye client surface: three calls, each a `CheckoutIntent` or a null failure. */
export interface RyeCheckoutClient {
  createIntent(input: CreateCheckoutIntentInput): Promise<CheckoutIntent | null>;
  getIntent(id: string): Promise<CheckoutIntent | null>;
  confirmIntent(id: string, payment: CheckoutPayment): Promise<CheckoutIntent | null>;
}

/** The `Authorization: Bearer …` + JSON headers for every Rye call. */
function ryeHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

/**
 * One bounded Rye HTTP call → a mapped intent, or null on ANY failure (non-2xx,
 * timeout, network error, malformed JSON, unrecognizable shape). Never throws.
 * Logs only the HTTP status or an error class — never a body, key, or PII.
 */
async function ryeCall(
  method: 'GET' | 'POST',
  url: string,
  apiKey: string,
  body?: unknown,
): Promise<CheckoutIntent | null> {
  try {
    const response = await fetch(url, {
      method,
      headers: ryeHeaders(apiKey),
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(RYE_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.error(`[era-checkout] Rye ${method} returned ${response.status}`);
      return null;
    }
    const json: unknown = await response.json().catch(() => null);
    const intent = mapIntent(json);
    if (intent === null) {
      console.error('[era-checkout] Rye response could not be mapped to a checkout intent');
    }
    return intent;
  } catch (error) {
    // No body, no PII, no key — just the failure class.
    const reason = error instanceof Error ? error.name : 'unknown';
    console.error(`[era-checkout] Rye ${method} request failed (${reason})`);
    return null;
  }
}

/**
 * Build a Rye checkout client bound to an API key + base URL. Pure construction — no
 * I/O until a method runs. `checkout-provider.ts` is the single caller; it selects the
 * base via {@link ryeApiBase} and reads the key from `process.env.RYE_API_KEY`.
 */
export function createRyeCheckoutClient(apiKey: string, baseUrl: string): RyeCheckoutClient {
  return {
    createIntent(input: CreateCheckoutIntentInput): Promise<CheckoutIntent | null> {
      return ryeCall('POST', `${baseUrl}/checkout-intents`, apiKey, createIntentBody(input));
    },
    getIntent(id: string): Promise<CheckoutIntent | null> {
      return ryeCall('GET', `${baseUrl}/checkout-intents/${encodeURIComponent(id)}`, apiKey);
    },
    confirmIntent(id: string, payment: CheckoutPayment): Promise<CheckoutIntent | null> {
      return ryeCall('POST', `${baseUrl}/checkout-intents/${encodeURIComponent(id)}/confirm`, apiKey, {
        paymentMethod: { type: payment.type, stripeToken: payment.stripeToken },
      });
    },
  };
}

// -----------------------------------------------------------------------------
// Webhook signature — HMAC-SHA256 over the RAW body, constant-time compared.
// -----------------------------------------------------------------------------

/**
 * Verify a Rye webhook signature. Rye signs the RAW request body with the endpoint's
 * secret and sends `x-rye-signature: v0=<hex HMAC-SHA256(rawBody)>`. We recompute the
 * HMAC and compare in CONSTANT TIME (`crypto.timingSafeEqual` on equal-length buffers;
 * a length check first — the signature length is not itself a secret, and
 * `timingSafeEqual` throws on unequal lengths — then a constant-time compare so a
 * correct-length forgery leaks nothing through timing). A missing/short-circuit header
 * fails closed. Never throws; the secret is never logged.
 */
export function verifyRyeSignature(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  if (!signatureHeader) {
    return false;
  }
  const expected = `v0=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
  const provided = Buffer.from(signatureHeader);
  const computed = Buffer.from(expected);
  if (provided.length !== computed.length) {
    return false;
  }
  return timingSafeEqual(provided, computed);
}

// Exported for unit tests only — the pure mappers, exercised with canned Rye JSON.
export const __testables = { mapIntent, mapOffer, createIntentBody };
