/**
 * @era/core — environment variable validation.
 *
 * This module is the SINGLE SOURCE OF TRUTH for the shape of the Era
 * environment. Call `loadServerEnv()` once at server startup so that boot
 * FAILS FAST and LOUDLY when configuration is missing or malformed, rather
 * than surfacing an obscure error deep inside a request handler.
 *
 * The client schemas (`webClientEnvSchema`, `mobileClientEnvSchema`) contain
 * ONLY publicly-exposable values by design — anything prefixed `NEXT_PUBLIC_`
 * or `EXPO_PUBLIC_` is shipped to the browser/device bundle. Never add a
 * secret to a client schema.
 *
 * Validation failures NEVER echo the received value: secrets must not leak
 * into logs. Error messages name the offending variable and the reason only.
 */

import { z } from 'zod';

const requiredString = z.string().min(1);

/**
 * Server-side environment — secrets and privileged configuration. Required
 * unless explicitly marked optional.
 */
export const serverEnvSchema = z.object({
  DATABASE_URL: requiredString,
  BETTER_AUTH_SECRET: requiredString,
  BETTER_AUTH_URL: z.string().url(),
  APPLE_OAUTH_CLIENT_ID: requiredString,
  APPLE_OAUTH_CLIENT_SECRET: requiredString,
  GOOGLE_OAUTH_CLIENT_ID: requiredString,
  GOOGLE_OAUTH_CLIENT_SECRET: requiredString,
  R2_ACCOUNT_ID: requiredString,
  R2_ACCESS_KEY_ID: requiredString,
  R2_SECRET_ACCESS_KEY: requiredString,
  // Four asset buckets. Raw originals and avatars are private (served only via
  // short-lived presigned GETs); cutouts and covers are served from a public
  // base URL for public profiles.
  R2_BUCKET_ITEMS_RAW: requiredString,
  R2_BUCKET_ITEMS_CUTOUT: requiredString,
  R2_BUCKET_OUTFIT_COVERS: requiredString,
  R2_BUCKET_AVATARS: requiredString,
  // Public base URLs for the two publicly-served buckets (r2.dev for now, a
  // custom domain later). Anonymous reads of public-profile assets hit these.
  R2_PUBLIC_URL_CUTOUTS: z.string().url(),
  R2_PUBLIC_URL_COVERS: z.string().url(),
  ANTHROPIC_API_KEY: requiredString,
  VISION_API_KEY: requiredString,
  BG_REMOVAL_API_KEY: requiredString,
  // Phase 2 — affiliate product feed. Optional until that feature ships.
  AFFILIATE_FEED_KEY: z.string().min(1).optional(),
  // Which Shop product provider to use. Defaults to the offline fixture catalog;
  // set to 'sovrn' (with a real AFFILIATE_FEED_KEY) to enable the live network
  // adapter. Any other value falls back to the fixture. Optional.
  AFFILIATE_PROVIDER: z.enum(['fixture', 'sovrn']).optional(),
  // Optional base URL override for the affiliate feed, for STAGING only. Never
  // user-derived; the adapter pins a documented default when this is unset. Optional.
  AFFILIATE_FEED_BASE_URL: z.string().url().optional(),
  // Inbound receipt email (Phase 2 — forward-a-receipt). Both OPTIONAL and the
  // feature stays DORMANT until BOTH are provisioned. INBOUND_EMAIL_DOMAIN is the
  // catch-all subdomain a user's private address lives on (`u_<token>@<domain>`);
  // RESEND_INBOUND_WEBHOOK_SECRET is the Svix secret for the inbound webhook
  // endpoint (SEPARATE from the outbound RESEND_WEBHOOK_SECRET). Read at the edge
  // through isRealCredential, so a committed `change-me-…` placeholder reads as
  // unconfigured. Never a client var — server-only.
  INBOUND_EMAIL_DOMAIN: z.string().min(1).optional(),
  RESEND_INBOUND_WEBHOOK_SECRET: z.string().min(1).optional(),
  // Era+ subscriptions (Phase 2). The whole surface is DARK until provisioned:
  // ERA_PLUS_ENABLED is the master feature flag ('true' to turn it on; any other
  // value / unset → off, see isEraPlusEnabled) and the webhook + checkout routes
  // ALSO require their own real credentials, so a flag alone unlocks nothing.
  // RevenueCat is the single source of entitlement truth for both platforms;
  // REVENUECAT_WEBHOOK_AUTH_TOKEN is the shared secret RC signs its webhook with
  // (compared timing-safe at the edge). The STRIPE_* vars power web checkout only
  // (iOS buys go through StoreKit → RC directly). All OPTIONAL and read through
  // isRealCredential at the edges, so a committed `change-me-…` placeholder reads
  // as unconfigured. Never client vars — server-only.
  ERA_PLUS_ENABLED: z.string().min(1).optional(),
  REVENUECAT_WEBHOOK_AUTH_TOKEN: z.string().min(1).optional(),
  STRIPE_SECRET_KEY: z.string().min(1).optional(),
  STRIPE_PRICE_ERA_PLUS_MONTHLY: z.string().min(1).optional(),
  STRIPE_PRICE_ERA_PLUS_ANNUAL: z.string().min(1).optional(),
  // Sandbox purchases (TestFlight/StoreKit sandbox, Stripe test mode) are FREE
  // and must never grant production Plus. This switch ('true' only) lets sandbox
  // rows count as entitled during the sandbox E2E window — flip it on to test,
  // off before launch, and never again after.
  ERA_PLUS_ALLOW_SANDBOX: z.string().min(1).optional(),
});

/** Public configuration exposed to the Next.js web client bundle. */
export const webClientEnvSchema = z.object({
  NEXT_PUBLIC_API_URL: z.string().url(),
  NEXT_PUBLIC_R2_PUBLIC_URL: z.string().url(),
  // Canonical public origin (e.g. https://era.style in prod). Drives
  // metadataBase, the sitemap, robots.txt, OpenGraph URLs, and every
  // canonical link — a wrong or missing value silently breaks SEO, so it is
  // required. NEXT_PUBLIC_ vars are inlined at build time; this schema
  // documents/validates the contract (boot is not gated on it — the web app
  // reads process.env directly with a localhost dev fallback).
  NEXT_PUBLIC_SITE_URL: z.string().url(),
  // Google Search Console verification token. Set when verifying era.style;
  // unset means no verification meta tag is emitted. Optional.
  NEXT_PUBLIC_GSC_VERIFICATION: z.string().optional(),
  // Era+ master flag mirrored to the web bundle so the client can show/hide the
  // paywall CTA. COSMETIC ONLY — 'true' to reveal, any other value / unset →
  // hidden (isEraPlusEnabled). Access is always decided server-side by
  // getPlusState; this flag never grants entitlement. Optional.
  NEXT_PUBLIC_ERA_PLUS_ENABLED: z.string().optional(),
});

/** Public configuration exposed to the Expo mobile client bundle. */
export const mobileClientEnvSchema = z.object({
  EXPO_PUBLIC_API_URL: z.string().url(),
  EXPO_PUBLIC_R2_PUBLIC_URL: z.string().url(),
  // Era+ master flag mirrored to the device bundle (COSMETIC — reveals the
  // paywall CTA only; access is decided server-side). 'true' to reveal. Optional.
  EXPO_PUBLIC_ERA_PLUS_ENABLED: z.string().optional(),
  // RevenueCat's PUBLIC iOS SDK key — publishable by design (it identifies the
  // app to RC and can only READ entitlements; the webhook secret is the private
  // half). Client-safe, still optional/dormant until the SDK is wired. Optional.
  EXPO_PUBLIC_REVENUECAT_IOS_KEY: z.string().optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;
export type WebClientEnv = z.infer<typeof webClientEnvSchema>;
export type MobileClientEnv = z.infer<typeof mobileClientEnvSchema>;

/**
 * Format a ZodError into a multi-line, secret-safe message. Only the variable
 * name (issue path) and the zod issue message are included — never the value
 * that was received.
 */
function formatEnvError(error: z.ZodError): string {
  const lines = error.issues.map((issue) => {
    const name = issue.path.join('.');
    return `  - ${name}: ${issue.message}`;
  });
  return `[@era/core] Invalid or missing environment variables:\n${lines.join('\n')}`;
}

function parseEnv<T extends z.ZodTypeAny>(schema: T, source: Record<string, string | undefined>): z.infer<T> {
  const result = schema.safeParse(source);
  if (!result.success) {
    throw new Error(formatEnvError(result.error));
  }
  return result.data;
}

/**
 * Parse and validate the server environment. Throws a loud, secret-safe Error
 * naming every missing or invalid variable. Call once at server startup.
 */
export function loadServerEnv(source: Record<string, string | undefined> = process.env): ServerEnv {
  return parseEnv(serverEnvSchema, source);
}

/** Parse and validate the web client's public environment. */
export function loadWebClientEnv(source: Record<string, string | undefined> = process.env): WebClientEnv {
  return parseEnv(webClientEnvSchema, source);
}

/** Parse and validate the mobile client's public environment. */
export function loadMobileClientEnv(source: Record<string, string | undefined> = process.env): MobileClientEnv {
  return parseEnv(mobileClientEnvSchema, source);
}
