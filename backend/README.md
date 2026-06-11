# Chara Backend

The Go API server for [Chara](../README.md), an open-source, self-hostable bill-splitting app (a Splitwise alternative). It exposes the REST API consumed by the mobile/web app: authentication, groups, expenses, splits, balances, settlements, receipt OCR, and push notifications. It is designed to run either as a self-hosted instance or as the hosted "Chara Cloud" tier.

## Stack

- **Go 1.25** — module `github.com/DowLucas/chara`
- **[Chi](https://github.com/go-chi/chi)** — HTTP router and middleware
- **[pgx](https://github.com/jackc/pgx) + PostgreSQL 16** — database driver and store
- **[sqlc](https://sqlc.dev)** — type-safe Go from raw SQL
- **[River](https://riverqueue.com)** — Postgres-native background job queue (no Redis)
- **[golang-migrate](https://github.com/golang-migrate/migrate)** — plain-SQL schema migrations
- **[MinIO / S3](https://github.com/minio/minio-go)** — S3-compatible object storage for receipt attachments
- **[golang-jwt](https://github.com/golang-jwt/jwt)** — JWT issuance/verification (HS256 selfhost, RS256 hosted)
- **[coreos/go-oidc](https://github.com/coreos/go-oidc)** — OIDC sign-in for self-hosted instances

## Prerequisites

- **Go 1.25+**
- **Docker** (for Postgres, MinIO, and the containerized backend)
- **PostgreSQL 16** (the dev workflow runs this in Docker for you)

## Quick start

### Run everything in Docker (recommended)

From the repository root:

```sh
./run-backend
```

`./run-backend` is idempotent. It ensures a standalone `chara-postgres` container is running on `localhost:5433`, then runs `docker compose up -d --build` (in `backend/`) to start the Go backend and MinIO, and waits for the liveness endpoint. The backend container uses `network_mode: host`, so it reaches Postgres at `localhost:5433` and MinIO at `localhost:9000` (MinIO console on `localhost:9001`).

Verify it is up:

```sh
curl http://localhost:8080/api/health/liveness
```

### Fast iteration with `go run`

For rapid local iteration without rebuilding the container, run the API directly against the Dockerized Postgres/MinIO:

```sh
cd backend && set -a && . ./.env.local && set +a && go run ./cmd/api
```

### Environment

All backend configuration lives in `backend/.env.local` (gitignored). Copy the template and edit:

```sh
cp backend/.env.example backend/.env.local
```

## Configuration

See [`.env.example`](.env.example) for the full, documented set of variables. Highlights:

| Variable | Notes |
|----------|-------|
| `INSTANCE_MODE` | `selfhost` (default) or `hosted`. Controls available auth methods and JWT signing. |
| `JWT_SECRET` | HS256 secret for selfhost; **minimum 32 characters**. (Hosted uses `JWT_PRIVATE_KEY_PEM` / `JWT_PUBLIC_KEY_PEM` instead.) |
| `DATABASE_URL` | Postgres DSN, e.g. `postgres://chara:password@localhost:5432/chara?sslmode=disable`. |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_REGION` | S3-compatible storage for receipt attachments (MinIO locally). |
| `SMTP_*` / `RESEND_API_KEY` | Email transport for magic links — SMTP (selfhost default) or Resend (hosted). |
| `OIDC_ISSUER_URL`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` | OIDC sign-in, self-hosted only (optional). |
| `GEMINI_API_KEY` | Enables multimodal receipt OCR. Optional — the OCR feature is disabled when unset. |

Other notable knobs documented in `.env.example`: `DEV_MODE`, `MAGIC_LINK_TTL`, `ALLOWED_CORS_ORIGINS`, `MIN_APP_PROTOCOL` / `MAX_APP_PROTOCOL`, `RECURRING_ENABLED`, and the hosted-only Google / Apple Sign In settings.

## Make targets

| Target | What it does |
|--------|--------------|
| `make generate` | Regenerate type-safe Go from SQL via sqlc (`cd sqlc && sqlc generate`). |
| `make migrate-up` | Apply all pending migrations (uses `$DATABASE_URL`). |
| `make migrate-down` | Roll back the most recent migration. |
| `make migrate-create name=<x>` | Scaffold a new sequential migration pair. |
| `make test` | Run the full test suite (`go test ./... -race -count=1`). |
| `make test-unit` | Run short tests only (`-short`). |
| `make test-integration` | Run integration tests (build tag `integration`). |
| `make lint` | Run `golangci-lint`. |
| `make build` | Build the API binary to `bin/api` (also the default target). |

`migrate-up` / `migrate-down` require `DATABASE_URL` to be set in the environment, e.g. `make migrate-up DATABASE_URL=postgres://chara:chara@localhost:5433/chara?sslmode=disable`.

## Project layout

```
backend/
├── cmd/api/          # main.go — entrypoint / server bootstrap
├── internal/         # application code (not importable outside the module)
│   ├── handler/      # HTTP handlers (auth, expenses, groups, balances, ...)
│   ├── server/       # router wiring and server setup
│   ├── middleware/   # Chi middleware (protocol version, auth, ...)
│   ├── db/           # generated sqlc code and store
│   ├── auth/ billing/ currency/ expense/ fx/ jobs/ money/
│   ├── receipt/ recurring/ settle/ split/ storage/ email/
│   ├── config/       # env parsing and instance-mode config
│   └── wellknown/    # /.well-known/* (instance discovery, app links)
├── migrations/       # plain-SQL golang-migrate files (NNNNNN_*.{up,down}.sql)
└── sqlc/             # sqlc.yaml + queries/ (source SQL for codegen)
```

Note: the canonical schema is defined by the files in `migrations/`. sqlc generates the Go data layer from `sqlc/queries/` against that schema — edit SQL there and run `make generate`, never hand-edit generated code.

## Testing

The project uses Go's standard testing with [testify](https://github.com/stretchr/testify). Run `make test` for the full race-enabled suite. Integration tests are gated behind the `integration` build tag (`make test-integration`) and spin up real dependencies (Postgres) via [testcontainers-go](https://golang.testcontainers.org/), so a working Docker daemon is required for those.

This project follows TDD — write the failing test first, then the implementation.

## Health check

```
GET /api/health/liveness
```

Returns `200` when the server is up. Used by `./run-backend`, the Docker `HEALTHCHECK`, and orchestrators.

## License

Chara is licensed under the **GNU Affero General Public License v3.0**. See [LICENSE](../LICENSE).
