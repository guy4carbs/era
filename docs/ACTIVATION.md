# Era — Activation Runbook (Phase 2B dormant features)

> Copy-paste runbook for lighting up the features that ship **coded-but-dormant**.
> Every one of them is inert until an operator provisions a real credential — the
> code already exists on `main`; this file is only the wiring.
>
> **Secret hygiene.** Everything below uses `<PLACEHOLDER>` where a value is
> provider-generated or user-secret. **Never** commit a real value — secrets live
> only as Railway **service variables** and as local `.env` (gitignored). The
> canonical var list is `apps/web/.env.example`.

---

## 0. What is dormant, and what wakes it

Era's Phase 2B surfaces are gated by the same idiom everywhere: a credential is
"real" only when it is set **and** does not start with a committed placeholder
prefix (`change-me…`, and additionally `sovrn-xxxx` for the affiliate key). Until
then the feature degrades gracefully — a 503, a dev-only log line, or the offline
fixture — and never fires a request that can only fail.

| Feature | Gate (code) | Dormant behavior | Wakes when |
|---------|-------------|------------------|-----------|
| Cron price-check | `authorizeCron` → `CRON_SECRET` real | `503 {"error":"cron not configured"}` | `CRON_SECRET` set to a non-placeholder value |
| Transactional email (magic-link + price-drop) | `isRealCredential(RESEND_API_KEY)` (`send-email.ts`) | dev: one greppable log line; **prod: throws `email provider not wired yet`** | `RESEND_API_KEY` set (real) |
| Affiliate / Sovrn live feed | `AFFILIATE_PROVIDER==='sovrn'` && `isRealCredential(AFFILIATE_FEED_KEY)` | offline fixture catalog | both set (key real) |
| Sovrn price re-query (primary price source) | same as above (`fetchViaSovrn`) | falls back to SSRF-gated scrape of `productUrl` | Sovrn adapter given a by-id lookup at onboarding |
| Mobile push | `getExpoPushTokenAsync({projectId})` + APNs/FCM creds on EAS | `push.ts` resolves `unavailable`, no token sent; server `expo-push.ts` no-ops with zero tokens | APNs `.p8` (iOS) / FCM v1 (Android) uploaded to EAS + `expo-notifications` plugin added |
| Ovi live LLM (already has brakes) | `isRealCredential(ANTHROPIC_API_KEY)` | deterministic stylist path | real key **+** global spend cap in place (§7) |

---

## 1. Env var matrix

All of these are set as **Railway service variables** on the `Era` service
(production environment; PR preview environments inherit from it). None are
committed.

| Var | Scope | Placeholder rule | What it activates |
|-----|-------|------------------|-------------------|
| `CRON_SECRET` | server | rejected if starts with `change-me` | Price-check cron route (503 → live) |
| `RESEND_API_KEY` | server | rejected if starts with `change-me` | All transactional email (magic-link **and** price-drop) |
| `EMAIL_FROM` | server | — (optional) | Sender identity; defaults to `Era <hello@era.style>` when unset |
| `AFFILIATE_PROVIDER` | server | must equal `sovrn` | Selects the Sovrn adapter over the fixture |
| `AFFILIATE_FEED_KEY` | server | rejected if starts with `change-me` **or** `sovrn-xxxx` | Sovrn live feed + price re-query |
| `AFFILIATE_FEED_BASE_URL` | server | — (optional) | Overrides the Sovrn base for **staging only**; prod uses `https://api.sovrn.com` |
| `AI_KILL_SWITCH` | server | truthy = `1`/`true`/`on`/`yes` (any case) | Hard-off for all live LLM calls (already wired) |
| `AI_GLOBAL_DAILY_USD` | server | positive finite number | App-wide daily AI-spend ceiling (already wired) |
| `ANTHROPIC_API_KEY` | server | rejected if starts with `change-me` | Ovi live LLM path — **keep gated until §7** |

> Set a Railway var with the dashboard, or the CLI (account owner, from repo root):
> ```bash
> railway variables --set CRON_SECRET=<PLACEHOLDER_CRON_SECRET>
> ```
> Changing a `NEXT_PUBLIC_*` var requires a **redeploy** (those inline at build);
> server-only vars above take effect on the next boot.

---

## 2. Database migrations (Neon)

Two migrations back Phase 2B and are **generated but unapplied**:

- `0003_clumsy_hobgoblin.sql` — `saved_products` table.
- `0004_late_inertia.sql` — `in_app_notifications`, `notification_preferences`,
  `push_tokens`, plus `saved_products.last_price_cents` / `.last_checked_at`.

Migrations `0000`–`0002` are already applied to Neon (per `CLAUDE.md`). Applying
`0003`/`0004` is a **manual maintainer step** — there is no auto-migrate on
deploy. The Drizzle config (`packages/db/drizzle.config.ts`) loads the **root**
`.env` first, so `DATABASE_URL` must point at the target (production Neon)
database when you run it.

```bash
# From the repo root. Use the PRODUCTION Neon connection string.
DATABASE_URL='<PLACEHOLDER_PROD_NEON_DATABASE_URL>' \
  pnpm --filter @era/db db:migrate
```

`db:migrate` runs `drizzle-kit migrate`, which applies only the pending files
(`0003`, `0004`) and records them in the Drizzle journal — re-running is a no-op
once applied. Verify the new tables (`saved_products`, `push_tokens`,
`notification_preferences`, `in_app_notifications`) exist before enabling the
cron.

---

## 3. Resend email (domain: `era.style`)

Lighting up `RESEND_API_KEY` activates **both** the price-drop alert **and** the
passwordless magic-link sign-in (which currently **throws in production** —
`email provider not wired yet` — until a real key exists). This is Phase-1
boundary **B1**.

**Steps:**

1. Create a Resend account and **Add Domain** → `era.style`.
2. Resend generates **per-domain** DNS records. Add them at **Cloudflare** (DNS
   for `era.style`). Record **types** are fixed; the **values** are shown in the
   Resend domain page — copy them verbatim:

   | Purpose | Type | Host / Name | Value source |
   |---------|------|-------------|--------------|
   | SPF | `TXT` | `send.era.style` (Resend's subdomain) | Resend shows the exact `v=spf1 include:…` string |
   | DKIM | `TXT` (or `CNAME`) | `resend._domainkey…` (Resend names it) | Resend generates the exact key/target per domain |
   | (optional) DMARC | `TXT` | `_dmarc.era.style` | Your policy, e.g. `v=DMARC1; p=none;` |

   > Set these Cloudflare records to **DNS-only (grey cloud)** — mail auth records
   > must not be proxied. Do **not** hand-type DKIM; paste exactly what Resend
   > surfaces (the CNAME target / TXT value differs per domain).
3. Back in Resend, click **Verify** on the domain (DNS propagation can take a few
   minutes to hours).
4. Create an API key in Resend and set it on Railway:
   ```bash
   railway variables --set RESEND_API_KEY=<PLACEHOLDER_RESEND_API_KEY>
   railway variables --set EMAIL_FROM='Era <hello@era.style>'   # optional; this is also the default
   ```
5. Redeploy / restart the `Era` service so the new server env is read.

Sender defaults to `Era <hello@era.style>` (`DEFAULT_FROM` in `send-email.ts`) —
the `EMAIL_FROM` you set must be an address on the **verified** domain.

---

## 4. Railway Cron (price-check sweep)

The route `POST /api/cron/price-check` runs the drop sweep. It is **not** session
-guarded — it is protected by the shared secret `CRON_SECRET`, sent in the
`x-cron-secret` header. With no real `CRON_SECRET` it returns
`503 {"error":"cron not configured"}` and does no work.

1. Set the secret on Railway:
   ```bash
   railway variables --set CRON_SECRET=<PLACEHOLDER_CRON_SECRET>   # long random string
   ```
2. Create a scheduler that POSTs the endpoint with the header. A Railway **Cron**
   service (or any external scheduler — GitHub Actions, cron-job.org) works. The
   call:
   ```bash
   curl -fsS -X POST https://era.style/api/cron/price-check \
     -H 'x-cron-secret: <PLACEHOLDER_CRON_SECRET>'
   ```
3. Suggested schedule — **every 6 hours** (price feeds don't move faster than the
   alert is useful, and the batch is capped at 200 rows/run):
   ```
   0 */6 * * *
   ```

**Responses:** `503` (secret unset/placeholder) · `401` (header missing/wrong) ·
`200 {"checked","dropped","alertsSent"}` on success. The route stays `503`-inert
until `CRON_SECRET` is provisioned, so wiring the scheduler before the secret is
harmless.

---

## 5. Mobile push (EAS)

The token flow (`apps/mobile/components/notifications/push.ts`) is opt-in and
dormant: it needs an EAS `projectId` (already set) **and** platform push
credentials on EAS. The server (`apps/web/src/lib/expo-push.ts`) delivers via
Expo's Push API (`https://exp.host/--/api/v2/push/send`) and no-ops when a user
has zero registered tokens. `expo-notifications@~57.0.3` is already a dependency.

**5a. Add the `expo-notifications` config plugin.** `apps/mobile/app.json`
currently lists only `expo-router`, `expo-secure-store`, and Sentry — the
notifications plugin is **not** present and must be added to the `expo.plugins`
array (Harbor owns this edit):

```jsonc
[
  "expo-notifications",
  {
    "icon": "./assets/notification-icon.png",
    "color": "#1C1B19"
  }
]
```

**5b. `projectId` — already wired.** `app.json` already carries
`expo.extra.eas.projectId` (`1a286870-918e-4213-b9ca-04f939315ba1`) and
`expo.owner` (`guy4carbss-team`), so `eas init` has been run. If you ever re-init,
commit the resulting `projectId`/`owner`.

**5c. iOS APNs key (needs a paid Apple Developer membership).** Upload an APNs
auth key so EAS can sign push:
```bash
pnpm --filter mobile exec eas credentials
# → iOS → Push Notifications → set up a Push Key (.p8), or upload an existing one
```

**5d. Android FCM v1.** Provide the FCM v1 service-account JSON to EAS:
```bash
pnpm --filter mobile exec eas credentials
# → Android → Push Notifications (FCM V1) → upload google-services service-account JSON
```

**5e. Build a client and test on a PHYSICAL device.** Push tokens are never
issued on a simulator (`push.ts` returns `unavailable` when `!Device.isDevice`):
```bash
pnpm --filter mobile exec eas build --profile development --platform ios   # dev client
# or --profile preview for a TestFlight (store) build
```
Install on a real iPhone/Android, enable "Push notifications" in Settings, and
confirm a token registers. Reference Scout's checklist for the account-gated
credential steps.

---

## 6. Sovrn affiliate feed

Shop runs on the offline fixture until the Sovrn adapter is engaged
(`shop-provider.ts`). Engagement requires **both** `AFFILIATE_PROVIDER=sovrn`
**and** a real `AFFILIATE_FEED_KEY` (rejected if it starts with `change-me` or
`sovrn-xxxx`).

1. Sign up for Sovrn Commerce, provision a Product Search key, and set:
   ```bash
   railway variables --set AFFILIATE_PROVIDER=sovrn
   railway variables --set AFFILIATE_FEED_KEY=<PLACEHOLDER_SOVRN_FEED_KEY>
   # AFFILIATE_FEED_BASE_URL only for staging; prod uses https://api.sovrn.com
   ```
2. **Confirm-at-onboarding checklist** — verify each of these against the live
   Sovrn account and update `shop-provider.ts` where they differ (every item
   below is flagged `CONFIRM AT ONBOARDING` in the code):

   | What | Code default | Confirm |
   |------|--------------|---------|
   | Host | `https://api.sovrn.com` | exact product-search host |
   | Search path | `/commerce/v1/products/search` | exact account/version path |
   | Auth scheme | `Authorization: Bearer <key>` | Bearer vs. custom header |
   | Request params | `keywords`, `minPrice`, `maxPrice`, `page`, `limit`, `cuid` | exact param names |
   | Sub-id (attribution) | `cuid=era` | that `cuid` is Sovrn's custom-user-id param |
   | Response fields | `title`,`brand`,`price`,`currency`,`imageUrl`,`retailer`/`merchant`,`productUrl`/`url`,`affiliateUrl`/`redirectUrl`,`category`,`inStock`/`availability`,`id`/`productId` | exact field names in the live payload |
   | Affiliate link | passed **UNTAMPERED** (never string-munged); sub-id rides in via `cuid` upstream | confirm the returned link already carries the sub-id |
   | Pagination | `hasMore = rows.length >= 20` (page-size heuristic) | replace with the real cursor/total if the feed provides one |
   | Category vocab | `SOVRN_CATEGORY_TO_ITEM` map → Era's 11 `item_category` values | extend to the real Sovrn category strings |

3. Price re-query: once the adapter exposes a **by-id lookup**, wire
   `fetchViaSovrn` (in `price-check.ts`) to return the current price by
   `saved.productId`. Until then the price-check falls back to the SSRF-gated
   re-scrape of `productUrl` — functional, just less precise.

---

## 7. Pre-real-`ANTHROPIC_API_KEY` checklist

Ovi's live LLM path is coded and gated behind `isRealCredential(ANTHROPIC_API_KEY)`.
The key is schema-required to boot, but the feature must stay off until the
global spend brakes are provably in place — this is Phase-1 boundary **B3** and
Sentinel's standing release condition.

Before pointing a **real** key at production model volume:

- [ ] **Durable, shared daily cap set** — `AI_GLOBAL_DAILY_USD=<PLACEHOLDER_USD>` on
  Railway. `checkGlobalAiGate` runs before every live call and blocks once the
  day's summed spend reaches the ceiling (per-user limits already ship).
- [ ] **Kill-switch reachable** — confirm `AI_KILL_SWITCH` flips the feature off
  instantly (`1`/`true`/`on`/`yes`, any case) without a redeploy.
- [ ] **Spend-write alerting** — alert on `recordUsage` write failures so a
  silently-failing meter can't let spend run uncapped.
- [ ] **Only then** set the real `ANTHROPIC_API_KEY` and un-gate Ovi.

Both brakes (`AI_KILL_SWITCH`, `AI_GLOBAL_DAILY_USD`) already exist in code
(`packages/core/src/ai-limits.ts`, `apps/web/src/lib/ai-usage.ts`) — this step is
about setting the values and the alert, not building the mechanism.
