<div align="center">

# Chara

**Open-source, self-hostable bill splitting.**
The Splitwise replacement for people who care where their data lives.

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](LICENSE)

</div>

---

Chara is a mobile-native bill-splitting app — iOS, Android, and Web from one
codebase — backed by a small Go API you can run yourself with a single
`docker compose up`. It's a direct alternative to Splitwise and Steven, with one
fundamental difference: it's fully open source under AGPLv3, and your data stays
on your server.

A hosted option (**Chara Cloud**) exists as an optional, paid convenience that
funds development. It runs the exact same code in this repository.

## Why

- **Splitwise** has paywalled core features (receipt scanning, search, charts,
  and capped free-tier expenses) behind a subscription.
- **Steven**, the Nordic incumbent, is in operational decline.
- Existing open-source alternatives are web-only PWAs or single-platform — none
  offer native iOS **and** Android **and** true self-hosting **and** Nordic
  payment-rail integration (Swish, Vipps, MobilePay).

Chara fills that gap.

## Features

- **Groups & expenses** — split equally, by share, by exact amount, or by
  percentage.
- **Multi-currency** — per-expense currency with FX snapshotting; balances never
  sum across currencies.
- **Balances & settlement** — net standings per person with debt simplification.
- **Multi-server accounts** — hold N independent server-accounts in one app and
  aggregate them into a single UI. Self-host your own and link a friend's server
  side by side.
- **Receipt scanning** — optional AI-assisted line-item extraction.
- **Auth that fits the deployment** — magic link everywhere; Google / Apple
  Sign-In on the hosted tier; OIDC (Authentik, Keycloak, Authelia, …) on
  self-hosted instances.
- **Push notifications**, internationalization, and a privacy-respecting design.

> Chara is pre-1.0 and under active development. See
> [`docs/implementation-status.md`](docs/implementation-status.md) for what's
> built today and [`docs/06-roadmap.md`](docs/06-roadmap.md) for what's next.

## Repository layout

| Path | What it is |
|------|------------|
| [`backend/`](backend/) | Go API — Chi router, sqlc, River job queue, Postgres. See [`backend/README.md`](backend/README.md). |
| [`app/`](app/) | Expo (React Native) app — iOS, Android, Web. See [`app/README.md`](app/README.md). |
| [`deploy/`](deploy/) | Self-host Docker Compose + Dockerfile. |
| [`docs/`](docs/) | Product strategy, technical architecture, roadmap, and UX diagrams. |

## Stack

| Layer | Choice |
|-------|--------|
| Backend | Go (Chi, sqlc, River, golang-jwt, go-oidc) |
| Mobile / Web | Expo (React Native) |
| Database | Postgres 16+ (plain-SQL migrations via golang-migrate) |
| Storage | S3-compatible (MinIO bundled for self-host) |
| Push | Expo Push Service (direct APNs/FCM as an advanced option) |
| Background jobs | River (Postgres-native, no Redis) |

## Self-hosting

A complete stack — API, Postgres, and MinIO — is defined in
[`deploy/docker-compose.yml`](deploy/docker-compose.yml).

```sh
cd deploy
cp .env.example .env       # set JWT_SECRET, POSTGRES_PASSWORD, MINIO_ROOT_*, BASE_URL
docker compose up -d
curl http://localhost:8080/api/health/liveness
```

Point the app at your server's URL and sign in with a magic link or your OIDC
provider. All deployment secrets (`JWT_SECRET`, database credentials, S3 keys)
are supplied via environment variables and are never committed.

## Local development

- **Backend (Go):** [`backend/README.md`](backend/README.md). The repo-root
  `./run-backend` script idempotently brings up Postgres, the API, and MinIO.
- **App (Expo):** [`app/README.md`](app/README.md).

## Contributing

Contributions are welcome — bug reports, features, docs, and translations. Please
read [`CONTRIBUTING.md`](CONTRIBUTING.md) first; it covers the TDD workflow, the
minimum-diff philosophy, the i18n rules, and the money-as-integer-minor-units
invariant. By participating you agree to the
[Code of Conduct](CODE_OF_CONDUCT.md).

## Security

Found a vulnerability? Please report it privately — see
[`SECURITY.md`](SECURITY.md). Do not open a public issue for security problems.

## License

Chara is licensed under the **GNU Affero General Public License v3.0**. See
[`LICENSE`](LICENSE). The AGPL's network-use clause means that if you run a
modified Chara as a network service, you must offer your users the source of
that modified version.
