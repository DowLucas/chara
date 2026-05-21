# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Quits is an open-source, self-hostable bill-splitting app (Splitwise alternative). See `docs/` for full product strategy, architecture, and UX diagrams.

## TDD

This project uses Test-Driven Development. Write the failing test first, then the implementation. No implementation code without a corresponding test written beforehand.

## Implementation status

`docs/implementation-status.md` tracks which milestones are complete and what tests exist. Update it whenever a milestone is finished.

## Stack

| Layer | Choice |
|-------|--------|
| Backend | Go — Chi router, sqlc, River job queue, golang-jwt/jwt, coreos/go-oidc |
| Mobile | Expo (React Native) — iOS, Android, Web from one codebase |
| Marketing site | Astro (static) |
| Database | Postgres 16+ — plain SQL migrations via golang-migrate |
| Storage | S3-compatible — MinIO bundled in Docker Compose for self-host |
| Push | Expo Push Service (default); direct APNs/FCM as advanced option |
| Background jobs | River (Postgres-native, no Redis) |

## Auth model

Auth is split by instance type:

- **Hosted tier**: email magic link, Google OAuth, Apple Sign In (iOS only)
- **Self-hosted**: email magic link, OIDC (Authentik, Keycloak, Authelia, etc.)

Google and Apple Sign In are **not available on self-hosted instances**. The app detects instance type from `/.well-known/quits-instance` and renders sign-in options accordingly.

## Money

All monetary values are stored and computed as **int64 minor units** (öre, cents). Decimal strings on the wire. Never use floats for money.

## i18n

The mobile app (`app/`) uses `i18next` + `react-i18next` + `expo-localization`. **All user-facing strings must go through `t()`** — no hardcoded English in JSX, `Alert.alert`, `placeholder`, `accessibilityLabel`, `Share.share`, etc.

- Catalog: `app/lib/locales/<lang>.json`, namespaced by screen (`signIn`, `home`, `groupDetail`, …). English is the only language today; add new locales by dropping a JSON file and registering it in `app/lib/i18n.ts` (`SUPPORTED_LANGUAGES`, `resources`).
- In components: `const { t } = useTranslation();` then `t('namespace.key', { interpolation })`. Outside React (e.g. `ActionSheet` helpers), `import i18n from '@/lib/i18n'` and call `i18n.t(...)`.
- Locale-aware formatting helpers live in `app/lib/i18n.ts`: `formatMinorUnits(minor, currency, { relative })`, `formatDate`, `formatTime`, `currentLocale()`. **Never hardcode a locale** (`'sv-SE'`, `'en-US'`) in `toLocaleString` — use `currentLocale()` or the helpers.
- Currency codes (`SEK`, `EUR`, …) are data, not UI copy — leave them as strings.
- When adding a new screen or string, add the key to `en.json` in the same commit. PRs that introduce raw English strings are incomplete.

## Local dev

### Backend with Docker (recommended)

All backend env vars (db config, JWT secret, `GEMINI_API_KEY` for OCR, etc.) live in `backend/.env.local` — gitignored.

```
cd backend && docker compose up -d --build
```

This starts a containerized Go backend with automatic migrations. Verify health with:

```
curl http://localhost:8080/api/health/liveness
```

The container uses `network_mode: host` to reach the postgres container at `localhost:5433`.

### Backend with go run (fast iteration)

For rapid local iteration without Docker overhead:

```
cd backend && set -a && . ./.env.local && set +a && go run ./cmd/api
```

There is no `.env.dev` / `.env.dev.local` split — secrets and dev config are co-located. `.env.example` documents the schema.

### Expo app caching

The Expo app caches `/.well-known/quits-instance` at module load (`app/lib/api.ts`), so after toggling a backend feature flag (e.g. adding `GEMINI_API_KEY`) you must hard-reload the Expo bundle (`r` in Metro) — restarting only the server isn't enough.

## Key architectural docs

- `docs/02-product-strategy.md` — MVP scope, feature priority matrix (P0/P1/P2/P3), target audiences
- `docs/03-technical-architecture.md` — Stack rationale, data model (SQL schemas), auth architecture, storage, payment rails, deployment
- `docs/06-roadmap.md` — Week-by-week build sequence
- `docs/07-ux-diagrams-index.md` — Index of all 82 UX flow diagrams
- `docs/ux/` — Mermaid diagrams for every screen and user flow, organized by area

## MVP scope (P0)

Build only what is marked P0. The full feature matrix is in `docs/02-product-strategy.md`. Resist scope creep — if it is not P0, it is not in the MVP.

Next milestone: **Week 8 — Balances and settlement** (see `docs/implementation-status.md`).
