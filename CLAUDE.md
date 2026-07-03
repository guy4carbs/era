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

## Current state

> Update this section as the build progresses.

**Phase 0 — COMPLETE (exit certified 2026-07-02).** All six exit criteria verified with fresh evidence: repo + CI green on main; Neon schema (15 tables, 3 enums) with API-layer authz proven live; R2 upload/read policies proven live; auth end-to-end (magic link, auto profile provisioning, sign-out/re-sign-in, single user, no duplicates); both apps run the tab shell (Feed/Closet/Design/Shop + Ovi FAB) from the shared design system; design system renders both modes with a 15/15 WCAG contrast audit enforced in CI.

- Monorepo: pnpm workspaces + Turborepo; GitHub `guy4carbs/era` (public), branch protection on main, CI = lint/typecheck/test.
- `apps/web`: Next 15 — Better Auth server (magic link; Apple/Google dormant until real creds), tab shell (bottom bar <1024, left rail ≥1024), /design-lab.
- `apps/mobile`: Expo SDK 57 — expo-router Tabs shell, SecureStore sessions, design-lab screen.
- `packages/tokens`: the design spec as law (see Design system rules); contrast audit runs as a test.
- `packages/core`: env validation, authz guards, R2 storage helpers, auth API shape, Ovi strings.
- `packages/db`: Drizzle schema on Neon (project era: main + dev branches), migration 0000 applied.
- Infra: R2 (4 buckets, 2 public), Railway project `era` (vars mirrored; deploy not wired yet). Nothing deployed to production.
- Known backlog: prod email provider for magic links; real Apple/Google OAuth creds; `exp://` origin gating + BETTER_AUTH_SECRET min-length before launch; upload size cap; user_id in public asset URLs; custom domain for R2; auth guard on the mobile (tabs) route group; motion.press token.
