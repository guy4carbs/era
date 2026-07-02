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

## Current state

> Update this section as the build progresses.

- Monorepo scaffolded (pnpm workspaces + Turborepo).
- `apps/web` and `apps/mobile` are empty placeholders.
- `packages/*` are typed placeholders.
- Nothing deployed.
