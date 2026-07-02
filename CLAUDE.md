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

## Current state

> Update this section as the build progresses.

- Monorepo scaffolded (pnpm workspaces + Turborepo).
- `apps/web` and `apps/mobile` are empty placeholders.
- Env contract + validation module landed: `apps/web/.env.example` and `apps/mobile/.env.example` define the env contracts, and `@era/core` ships a zod env module (`loadServerEnv`/`loadWebClientEnv`/`loadMobileClientEnv`) with real `node:test` tests.
- `packages/core` now has real code and tests; `packages/tokens` and `packages/db` remain typed placeholders.
- Storage layer landed in `@era/core` with four R2 buckets provisioned: `item-images-raw`, `item-images-cutout`, `outfit-covers`, `avatars` (see Image pipeline). Env contract now includes 4 bucket-name vars plus 2 public base URL vars (for the public cutout and cover buckets).
- Nothing deployed.
- GitHub remote is live: private repo `guy4carbs/era`.
- CI runs on every PR and push to `main` via GitHub Actions — three checks: lint, typecheck, test.
- Branch protection is enabled on `main` (direct pushes blocked; green CI required to merge).
- The `check-types` task has been renamed to `typecheck`.
- CI verified end to end via this PR (three green checks).
