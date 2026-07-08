# Era — Claude Code Configuration

> Product judgment calls are governed by [`docs/PRODUCT.md`](docs/PRODUCT.md). Read it before making any product decision.

## Project overview

Era is a virtual wardrobe app. Ovi is the AI stylist — she appears as a floating button available everywhere in the app and suggests outfits from clothes the user already owns.

## Stack

| Layer | Tech |
|-------|------|
| Monorepo | pnpm workspaces + Turborepo |
| Language | TypeScript (strict everywhere) |
| Web app | Next.js (`apps/web`) |
| Mobile app | Expo / React Native (`apps/mobile`) |
| Shared domain | `packages/core` (logic + types) |
| Design tokens | `packages/tokens` |
| Database | `packages/db` (Drizzle planned) |
| TS config | `packages/typescript-config` (shared strict tsconfig) |
| Lint/format | `packages/eslint-config` (ESLint 9 flat config + Prettier 3) |
| Runtime | Node >= 22, pnpm 10, Turbo 2 |

> This repo is pnpm/turbo — any global bun/npm preference does not apply here.

## Repo structure

```
era/
├── apps/
│   ├── web/                  # Next.js app (placeholder)
│   └── mobile/               # Expo / React Native app (placeholder)
├── packages/
│   ├── core/                 # Shared domain logic + types
│   ├── tokens/               # Design tokens
│   ├── db/                   # Database layer (Drizzle planned)
│   ├── typescript-config/    # Shared strict tsconfig
│   └── eslint-config/        # Shared ESLint 9 flat config + Prettier
└── docs/                     # Product + engineering docs
```

## Coding conventions

- TypeScript strict mode, no exceptions.
- Functional components only.
- No default exports — use named exports.

## Commit convention

Conventional commits: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, with an optional scope — e.g. `feat(closet): add garment tagging`.

## Branch strategy

- Feature branches only — open a PR and **squash merge** into `main`.
- `main` is always deployable; direct pushes to `main` are blocked by branch protection.
- CI must be green (lint, typecheck, test) before a PR can merge.
- Branch names are short kebab-case with a conventional prefix — e.g. `feat/closet-grid`, `fix/token-colors`.

## Security

- Secrets live only on the server. Clients (the browser bundle, the Expo app) never hold keys.
- Every secret-bearing call goes through the API — the client asks, the server holds the credential.
- Only `NEXT_PUBLIC_*` / `EXPO_PUBLIC_*` vars may reach a client bundle, and they must contain no secrets (public URLs only).
- Env is validated at startup by `@era/core`'s zod env module (`loadServerEnv` et al.) — boot fails loudly, naming the missing var, and never printing values.
- `.env*` files are gitignored (only `.env.example` is committed); real values live in local `.env` files and Railway service settings.

## Image pipeline

Item and outfit imagery lives in Cloudflare R2. Presigning is server-only — clients never hold R2 credentials.

### Buckets

| Bucket | Contents | Visibility |
|--------|----------|------------|
| `item-images-raw` | Original uploads | Private |
| `item-images-cutout` | Processed 2.5D assets | Public via `r2.dev` (for public profiles) |
| `outfit-covers` | Outfit cover images | Public via `r2.dev` (for public profiles) |
| `avatars` | User avatars (Phase 4) | Private |

Path convention: `{user_id}/{uuid}.{ext}`.

### Upload flow

1. Client downscales the image to a max of 1600px on the long edge.
2. Client asks the API route `upload-url`; after authorization the server returns a short-lived (5 min) presigned PUT.
3. Client PUTs the file directly to R2.

### Read flow

- Public profiles' cutouts and covers are read from the public base URL with no auth.
- Raw images and any private owner's assets are read only via an authorized, short-lived presigned GET.

### Lifecycle

Raw upload → processing → cutout stored → raw retained for future re-processing. Raws are never deleted on processing success — they are kept so assets can be re-processed later.

### Helpers

Live in `@era/core`: `requestUploadUrl()` and `getAssetUrl()`. Presigning is server-only; clients never hold R2 credentials.

### Item import (Phase 2 completion)

An item can enter the wardrobe three ways, all converging on the shared `processItemPipeline` (`apps/web/src/lib/item-pipeline.ts` — bg removal + vision, then persist), which sets `items.source` accordingly:

- **Photo** (`source: 'photo'`) — `POST /api/process-item` on a raw upload. Live.
- **Link** (`source: 'link'`) — `POST /api/import-from-url { url }`. **Live.** Server-side fetches the product page, scrapes JSON-LD/OpenGraph metadata (regex parsing — a real HTML parser is a Phase-2 nicety), downloads the product image, stores it to `items-raw`, and runs the pipeline with the scraped name/brand/price/currency as prefill. Every user-URL fetch goes through the SSRF gate in `apps/web/src/lib/url-import.ts` (https-only, no credentials/non-443 ports, all resolved addresses must be public, redirects re-validated per hop, wall timeout, capped body). Known Phase-2 hardening: pin the resolved IP at connect time to close the DNS-rebinding TOCTOU.
- **Email receipt** (`source: 'email_import'`) — `POST /api/import-email`. **Scaffolded only** (route returns `501`, session-gated). The `ReceiptParser` interface + `ReceiptItem`/`ParsedEmail`/`ReceiptImportRequest` types are defined; the flow (email → parser registry by sender domain → per-item import via the same url/image pipeline) is documented in the route. Building the parser registry and ingest transport is the remaining Phase 2 completion work.

## SEO conventions

Every indexable page inherits these. Public surfaces are the landing `/` and the
legal pages `/privacy` + `/terms`; everything else (the `(tabs)` app, onboarding,
quiz, settings, design-lab, `/api/*`) is behind auth and `Disallow`ed.

**Canonical host.** `NEXT_PUBLIC_SITE_URL` is the single canonical origin (e.g.
`https://era.style` in prod; localhost fallback in dev). Read it ONLY through
`siteUrl()` in `apps/web/src/lib/site-url.ts` (strips any trailing slash,
client-safe) — never `process.env` directly. It feeds `metadataBase`, canonicals,
OpenGraph URLs, `sitemap.ts`, `robots.ts`, and the JSON-LD builders.

**Metadata.** Unique title ≤ 60 chars, keyword-leading, via a `title.template`
(default) + per-page `title` override; description ≤ 155 chars; a canonical +
per-page OpenGraph on every indexable page. The `(site)` layout sets the brand
defaults + `metadataBase`; per-page `metadata` overrides title/description/
canonical.

**Structured data.** JSON-LD lives in Nova's `JsonLd` component(s) (Organization
+ WebSite/WebApplication site-wide; FAQPage on the landing's FAQ). All `@id`/`url`
values resolve through `siteUrl()`.

**Sitemap / robots / llms.** `apps/web/src/app/sitemap.ts` → `/sitemap.xml`
(static routes now; a documented slot for Layer-2/3 dynamic entries — journal,
`/styles/{archetype}`, public profiles). `apps/web/src/app/robots.ts` →
`/robots.txt` (enumerated disallow list — keep in lockstep with the sitemap).
`apps/web/public/llms.txt` → `/llms.txt` (static, authored by editorial).

**Images / alt text.** Public-site imagery uses `next/image`; hosts are allow-
listed in `next.config.ts` `images.remotePatterns` (`**.r2.dev` + any custom R2
domain from `NEXT_PUBLIC_R2_PUBLIC_URL`). Alt text is mandatory and descriptive —
for item imagery, compose it from the item's tags (category / color / brand).

**Redirects (301).** The ONE place is `next.config.ts` `async redirects()`. In-app
*path* 301s only (retired/renamed routes). Host-level normalization (www ↔ apex,
http → https) is handled at the Railway/DNS edge, NOT here.

**Removed content.** 404 → the global `apps/web/src/app/not-found.tsx` (on-brand,
`noindex`). For permanently removed *public* content (Layer-3 deleted profiles),
return HTTP 410 via `gone()` in `apps/web/src/lib/http.ts` from a route handler —
`notFound()` only yields a 404.

**Search Console.** Set `NEXT_PUBLIC_GSC_VERIFICATION` to the GSC token when
verifying the domain; the `(site)` layout emits the verification meta tag (no-ops
when unset).

**Lighthouse budget (CI `lighthouse` job).** `apps/web/lighthouserc.json`, median
of 3 runs over `/`, `/privacy`, `/terms`. `categories:seo` ≥ 0.95 is a hard
ERROR; `largest-contentful-paint` < 2500ms, `total-blocking-time` < 300ms,
`cumulative-layout-shift` < 0.1 are tolerant WARNs (CI-runner noise must not
hard-fail perf). The job boots the app with placeholder env (the landing's
`getSession` is guarded for anon).

## Deployment (Railway)

`apps/web` deploys to [Railway](https://railway.app) as a **single service** — the
Next.js app serves the marketing site, the web app, and the `/api/*` routes from
one process. There is no separate API service. Production runs on Railway project
`era` (production environment); the mobile app is built/shipped separately via Expo
and is not part of this service.

### Build & run

Railway builds from the **repo root** with Nixpacks. Config lives in two committed
files:

- **`railway.json`** — selects the Nixpacks builder and the deploy settings
  (start command, health check on `/`, restart policy).
- **`nixpacks.toml`** — pins the toolchain (Node 22 + pnpm 10.4.1 via corepack)
  and defines the build phases. It builds **only** `apps/web` and the workspace
  packages it depends on — `apps/mobile` never enters the build.

| Phase | Command |
|-------|---------|
| Install | `corepack enable && corepack prepare pnpm@10.4.1 --activate && pnpm install --frozen-lockfile` |
| Build | `pnpm exec turbo run build --filter=web...` |
| Start | `pnpm --filter web start` → `next start -p ${PORT:-3000}` |

`next start` binds `0.0.0.0:$PORT` (Railway injects `$PORT`). The workspace
packages (`@era/core`, `@era/db`, `@era/tokens`) ship as TypeScript source and are
transpiled by Next (`transpilePackages` in `next.config.ts`), so they have no
build step of their own — the only build that runs is `next build`.

### PR preview environments

Railway's **PR Environments** feature gives every open PR an ephemeral deploy.
Enable it once in the dashboard (not file-config):

1. Connect the GitHub repo `guy4carbs/era` to the `Era` service (Railway GitHub App).
2. Project → **Settings → Environments → Enable "Enable PR Environments"**.

Each PR then spins up a temporary environment cloned from the base (production)
environment — it inherits that environment's variables, so every required var
below must be present on the base environment for previews to boot. Railway
comments the preview URL on the PR and tears the environment down on merge/close.

### Environment variables

All are set as **service variables** in Railway (never committed). The server env
is validated at boot by `@era/core`'s `loadServerEnv` — a missing/invalid var
fails the deploy loudly, naming the offender. `.env.example` is the canonical list.

**Server-only (required to boot):** `DATABASE_URL`, `BETTER_AUTH_SECRET`
(32+ chars), `BETTER_AUTH_URL` (the live URL), `APPLE_OAUTH_CLIENT_ID`,
`APPLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`,
`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_ITEMS_RAW`,
`R2_BUCKET_ITEMS_CUTOUT`, `R2_BUCKET_OUTFIT_COVERS`, `R2_BUCKET_AVATARS`,
`R2_PUBLIC_URL_CUTOUTS`, `R2_PUBLIC_URL_COVERS`, `ANTHROPIC_API_KEY`,
`VISION_API_KEY`, `BG_REMOVAL_API_KEY`.

**Server-only (optional):** `AFFILIATE_FEED_KEY` (Phase 2 — Shop).

**Client-safe (`NEXT_PUBLIC_*`, inlined into the browser bundle at build time —
must be present at BUILD, not just runtime):** `NEXT_PUBLIC_API_URL`,
`NEXT_PUBLIC_R2_PUBLIC_URL`, `NEXT_PUBLIC_SITE_URL` (the canonical origin —
`https://era.style` in prod; feeds canonicals/`sitemap.xml`/`robots.txt`, so a
wrong or missing value ships wrong canonicals) (+ the `NEXT_PUBLIC_ANALYTICS_*`
vars once the waitlist/analytics work lands). Public URLs only — never a secret.
Optional: `NEXT_PUBLIC_GSC_VERIFICATION` (Google Search Console token; unset →
no verification tag).

> `ANTHROPIC_API_KEY` is schema-required, so a value must exist for the deploy to
> boot, but Ovi (the Claude-backed stylist) must stay gated until the API
> rate-limit precondition lands — keep the key present but the feature off.

### Going live (account-gated — coordinate with the user)

The live deploy is gated on the Railway account; only the account owner triggers
it. Sequence from the repo root:

```bash
railway login            # once, interactive — run as `! railway login` in-session
railway link             # select project `era`, environment `production`, service `Era`
railway up               # build + deploy the current checkout
```

Or, preferred: connect the GitHub repo to the service so **pushes to `main`
auto-deploy** (and PRs get preview environments). Confirm the service's custom
domain / generated URL in the dashboard and set `BETTER_AUTH_URL` +
`NEXT_PUBLIC_API_URL` to match it before first boot.

## Mobile release (EAS + TestFlight)

`apps/mobile` is built and shipped separately from the Railway web service, via
**EAS** (Expo Application Services). Builds and submits are **account-gated** —
the user runs them after `eas login` with the Era Expo account and their active
Apple Developer membership. Config lives in **`apps/mobile/eas.json`** (committed);
`eas-cli` is pinned as a devDependency so no global install is required.

### How to run eas

```bash
pnpm --filter mobile exec eas <command>    # uses the pinned devDependency
# or install globally: npm i -g eas-cli && eas <command>
```

### eas.json profiles

`cli.appVersionSource` is **`remote`** — EAS owns the iOS `buildNumber` and
auto-increments it server-side on each build, so build numbers never collide and
nothing needs hand-editing in `app.json`. `expo.version` (the human-facing
marketing version) stays under our control in `app.json`.

| Profile | distribution | Purpose |
|---------|--------------|---------|
| `development` | `internal` | Dev-client build for local testing (`ios.simulator: true`). Not TestFlight. |
| `preview` | **`store`** | The build that goes to **TestFlight internal testing**. `autoIncrement: true`, Release config. |
| `production` | `store` | The App Store release build. `autoIncrement: true`, Release config. |

> **Why `preview` is `store`, not `internal`:** TestFlight requires a
> store-signed build uploaded to App Store Connect. EAS's `internal` distribution
> is ad-hoc (direct device install by UDID) and does **not** route through
> TestFlight. So the profile the task wants "on TestFlight" must be
> store-distribution — hence `preview: { distribution: "store" }`.

### One-time setup

Prerequisites: an **Expo account** (create at expo.dev), an **active Apple
Developer Program** membership, and eas-cli (pinned devDependency, above).

```bash
pnpm --filter mobile exec eas login          # authenticate the Expo account
pnpm --filter mobile exec eas init           # links the project; writes
                                             #   expo.extra.eas.projectId +
                                             #   expo.owner into app.json (commit these)
```

**Submit credentials (recommended: App Store Connect API key).** In App Store
Connect → **Users and Access → Integrations → App Store Connect API**, create a
key with **App Manager** role and download the `.p8` (downloadable **once**).
That gives you three values, which fill the placeholders in `eas.json`'s `submit`
profiles:

| eas.json placeholder | Where it comes from |
|----------------------|---------------------|
| `ascApiKeyId` | The Key ID shown next to the key |
| `ascApiKeyIssuerId` | The Issuer ID at the top of the API Keys page |
| `ascApiKeyPath` | Local path to the downloaded `.p8` — keep it **outside the repo or gitignored**; never commit it |

The API-key path is preferred over interactive Apple login (`appleId` / password /
2FA on every submit) because it is non-interactive and CI-safe. Alternatively,
run `eas submit` once with no key configured and let **EAS store the ASC API key
on Expo's servers** — then the `submit.ios` block can be emptied entirely and EAS
supplies the credential. `ascAppId` (the App Store Connect app's numeric ID) is
optional once the app record exists and EAS can resolve it by bundle id.

### Recurring release flow (to get a build onto TestFlight)

1. **Bump the marketing version** in `apps/mobile/app.json` (`expo.version`) when
   the release warrants it. Leave `buildNumber` alone — EAS autoIncrements it
   (`appVersionSource: remote`).
2. **Build:**
   ```bash
   pnpm --filter mobile exec eas build --profile preview --platform ios
   ```
3. **Submit to App Store Connect:**
   ```bash
   pnpm --filter mobile exec eas submit --profile preview --platform ios --latest
   ```
   (`--latest` grabs the build from step 2; omit it to pick interactively.)
4. The build lands in **App Store Connect → your app → TestFlight**. It goes
   through Apple's processing (a few minutes) and may need export-compliance
   answered once.
5. Add the build to an **internal testing group** (up to 100 App Store Connect
   users, no Apple review needed for internal testers).
6. Testers install the **TestFlight** app on their device and get the build.

For the App Store proper, repeat with `--profile production` and promote the
build in App Store Connect.

### Caveats

- **Bundle id is permanent at first build.** Currently `com.era.app` (in
  `app.json`, iOS + Android). It cannot be changed after the first App Store
  Connect record is created. **Decide before the first build** whether to keep
  `com.era.app` or switch to `style.era` (reverse-DNS of the `era.style` domain).
  Flag this to the user — it is a one-way door.
- **First TestFlight build should not be `1.0.0`-versioned by accident.**
  `expo.version` is currently `0.0.0`; recommend bumping to **`1.0.0`** before the
  first build (Harbor owns that edit in `app.json`).
- **Sentry source maps** upload automatically during the EAS build via the
  `@sentry/react-native/expo` plugin (already in `app.json`). That upload needs a
  `SENTRY_AUTH_TOKEN` — add it as an **EAS secret**
  (`pnpm --filter mobile exec eas secret:create --scope project --name SENTRY_AUTH_TOKEN --value <token>`)
  **only once a real Sentry DSN/project is wired**; until then the plugin no-ops
  and no token is required.

### Custom domain & Search Console (era.style — account-gated)

Production serves from **era.style**. To wire the domain and get indexed:

1. Railway → the `Era` service → **Settings → Networking → Custom Domain** → add
   `era.style` (and `www.era.style` if wanted). Railway shows a DNS target.
2. At the registrar, add the record Railway specifies — a CNAME/ALIAS to that
   target (the apex may need ALIAS/ANAME or the registrar's CNAME-flattening).
   Pick ONE canonical host and redirect the other (`www` ↔ apex) at the edge.
3. Set the origin on the production env — these inline at BUILD, so **redeploy**
   after changing: `NEXT_PUBLIC_SITE_URL=https://era.style`,
   `BETTER_AUTH_URL=https://era.style`, `NEXT_PUBLIC_API_URL=https://era.style`.
4. Verify in **Google Search Console**: either paste the token into
   `NEXT_PUBLIC_GSC_VERIFICATION` and redeploy (the `(site)` layout emits the
   `google-site-verification` meta tag), or add the GSC DNS TXT record. Then
   submit `https://era.style/sitemap.xml`.

## Current state

> Update this section as the build progresses.

**Phase 1 — COMPLETE (MVP exit certified 2026-07-05).** The core loop is real, tested, and live. Certified by Gauge (Release Authority — MVP loop verified end-to-end; `turbo lint/typecheck/test` 15/15; `@era/core` 150/150; era.style live) and Compass (Product — complete, lovable, MVP-exit-shippable). PRs #8–#18 squash-merged to `main`. *(Phase 0 exit-certified 2026-07-02: monorepo + CI + branch protection, Neon schema + API authz, R2, Better Auth, design system with the enforced 15/15 WCAG contrast audit, tab shell both platforms.)*

**What ships (all on `main`, gate-verified per phase):**
- **Quiz** (P1.1) — 12-step deterministic style-profile scorer (LLM polish dormant); both platforms.
- **Add item** (P1.2) — photo + link import (bg-removal + Claude-vision pipeline; SSRF-gated URL fetch); email-receipt scaffolded (501).
- **Closet** (P1.3) — premium 2.5D gallery: detail, edit, archive, privacy toggle.
- **Outfit canvas + eras** (P1.5) — compose/save/reopen looks; style-chapter "eras".
- **Ovi** (P1.6) — deterministic stylist proposing ONLY from owned items (never fabricates); weather-aware Today card (web; mobile weatherless — expo-location deferred); accept/reject → `ai_events`. LLM path coded + dormant behind `isRealCredential`.
- **Marketing site + waitlist** (P1.7) — quiet-luxury landing; waitlist capture + referral attribution.
- **Settings + account deletion + legal** (P1.8) — theme/privacy/support; GDPR/App-Store deletion (R2 + full DB cascade); DRAFT privacy/terms.
- **Analytics + AI cost guardrails** (P1.9) — PostHog/Sentry funnel (dormant); `ai_usage` table; **durable per-user daily rate limits** on the AI routes; spend log.
- **SEO Layer 1** (P1.11) — metadata/canonicals, JSON-LD, sitemap/robots/llms.txt, Lighthouse CI gate (SEO ≥ 95).
- **EAS + TestFlight** (P2.0) — installed on a physical iPhone from an EAS cloud build (bundle `style.era`, v1.0.0).

**LIVE in production: https://era.style** — Cloudflare DNS (grey-cloud/DNS-only) → Railway single service (site + app + API), SSL valid. Marketing site + waitlist capturing; SEO surfaces live (canonical = era.style). The full app is deployed; the `.up.railway.app` host still serves too. Neon migrations 0000–0002 applied.

**Honest boundary — "MVP-exit shippable" ≠ public-launch-ready.** Today Phase 1 lets you: collect waitlist signups on a live, SEO'd domain **and** demo the full app to testers via TestFlight. Before a real PUBLIC launch (users actually signing in), gate on:
- **B1 (app usability):** wire a prod **magic-link email provider** (+ real Apple/Google OAuth) — testers can install but cannot yet sign in in prod.
- **B2 (security):** add a session guard to the mobile `(tabs)` route group (still unguarded; Phase-0 carry-over).
- **B3 (before a real `ANTHROPIC_API_KEY`):** enforce a **global daily AI-spend cap / kill-switch** + alert on `recordUsage` write failures. (Per-user rate limits already live.)
- Before live PostHog/Sentry keys: EU cookie-consent + PII scrub. Before public legal: fill the `[BRACKETS]` + counsel-review the privacy/terms DRAFTs. User: verify era.style in Google Search Console + submit the sitemap.

**Phase 2 doorway (Shop + stickiness):** shortest first move — wire the affiliate feed into the (stubbed, trust-rule-aligned) Shop tab, driven by Ovi's existing `whats_missing` gap computation ("buy only for a real gap").

- CI = lint/typecheck/test + a Lighthouse job (SEO ≥ 95 hard-gate, perf tolerant).
- Infra: R2 (4 buckets), Neon (main+dev), Railway `era` production on era.style. Cloudflare = registrar + DNS for era.style (orange-cloud WAF + www redirect + email DNS are later hardening).
- Carried backlog: retroactive-privacy storage fix; durable/shared (cross-instance) rate limit; better-auth web/mobile version drift; upload size cap; `user_id` in public asset URLs; SEO Layer 2/3 (P2.7).
