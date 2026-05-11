# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Quits is an open-source, self-hostable bill-splitting app (Splitwise alternative). See `docs/` for full product strategy, architecture, and UX diagrams.

## TDD

This project uses Test-Driven Development. Write the failing test first, then the implementation. No implementation code without a corresponding test written beforehand.

## Planned stack

The codebase does not exist yet. When implementation begins, the stack is:

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

## Key architectural docs

- `docs/02-product-strategy.md` — MVP scope, feature priority matrix (P0/P1/P2/P3), target audiences
- `docs/03-technical-architecture.md` — Stack rationale, data model (SQL schemas), auth architecture, storage, payment rails, deployment
- `docs/06-roadmap.md` — Week-by-week build sequence
- `docs/07-ux-diagrams-index.md` — Index of all 82 UX flow diagrams
- `docs/ux/` — Mermaid diagrams for every screen and user flow, organized by area

## MVP scope (P0)

Build only what is marked P0. The full feature matrix is in `docs/02-product-strategy.md`. Resist scope creep — if it is not P0, it is not in the MVP.
