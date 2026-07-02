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

## Current state

> Update this section as the build progresses.

- Monorepo scaffolded (pnpm workspaces + Turborepo).
- `apps/web` and `apps/mobile` are empty placeholders.
- `packages/*` are typed placeholders.
- Nothing deployed.
- GitHub remote is live: private repo `guy4carbs/era`.
- CI runs on every PR and push to `main` via GitHub Actions — three checks: lint, typecheck, test.
- Branch protection is enabled on `main` (direct pushes blocked; green CI required to merge).
- The `check-types` task has been renamed to `typecheck`.
- CI verified end to end via this PR (three green checks).
