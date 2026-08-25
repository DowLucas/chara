# Broadcast push notifications (release notes)

Send a short push notification (e.g. a release note) to **every registered
device** on an instance via `POST /api/admin/notify`.

## Why this is safe in a public repo

The endpoint's protection is a **secret token**, not the secrecy of the code.
Publishing the source reveals the *shape* of the request but nothing that lets
someone send a notification:

- **API layer** — every request must carry `Authorization: Bearer <ADMIN_API_TOKEN>`.
  The backend compares it in constant time and returns `404` (as if the route
  didn't exist) whenever `ADMIN_API_TOKEN` is unset, and `401` on a wrong token.
  The token lives only in the server's environment and a private GitHub secret —
  never in the repo.
- **GitHub layer** — the [`Send broadcast notification`](../../.github/workflows/send-broadcast.yml)
  workflow is `workflow_dispatch` only, so **only users with write access** to
  the repo can run it. Secrets are encrypted, masked in logs, and are **not**
  exposed to workflows from forks or pull requests. Add required reviewers to
  the `production` environment for a second-person approval gate.

So: an outside contributor can read every line here and still cannot send a
broadcast — they have neither the token nor workflow-dispatch permission.

## One-time setup

Use a **single** token value in two places (they must match): the production
backend and the GitHub Actions secret.

### 1. Generate + set the token in production

On the host that runs the backend (prod stack lives at `/opt/stacks/chara/`,
which injects `.env` via `env_file`):

```sh
# backup, then write ADMIN_API_TOKEN without ever printing the value
sudo cp /opt/stacks/chara/.env /opt/stacks/chara/.env.bak-preadmin-$(date +%Y%m%d-%H%M%S)
sudo ./rotate-admin-token /opt/stacks/chara/.env
```

`rotate-admin-token` (repo root) generates `openssl rand -hex 32`, upserts the
key non-destructively (600 perms), and prints only a one-way fingerprint.

### 2. Mirror the same value into the GitHub secret

```sh
# reads the value straight from prod and pipes it into the secret — never printed
sudo grep -E '^ADMIN_API_TOKEN=' /opt/stacks/chara/.env | cut -d= -f2- | tr -d '\n' \
  | gh secret set ADMIN_API_TOKEN --repo DowLucas/chara
```

### 3. Point the workflow at the instance

```sh
gh variable set CHARA_API_URL --repo DowLucas/chara --body "https://<your-api-host>"
```

`CHARA_API_URL` is the public base URL of the backend (e.g. the value of
`BASE_URL` in the prod `.env`). It's not secret, so a repo variable is fine.

### 4. Deploy a backend build that has the endpoint

`/api/admin/notify` ships in the image built from `main`. Merging to `main`
triggers `backend-image.yml`, which publishes `ghcr.io/dowlucas/chara-backend:latest`;
Watchtower then recreates `chara-backend`. Delivery also requires the job queue
(`RECURRING_ENABLED` not `false`) — otherwise the endpoint returns `503`.

> **Watchtower does not re-read `env_file`.** It recreates the container from the
> config baked in at the last `docker compose up`, so a token added/changed in
> `.env` *after* that point never reaches the container — the endpoint then
> returns `404` (route hidden) even though `.env` looks correct. After any change
> to `ADMIN_API_TOKEN` in `.env`, you **must** run `docker compose up -d backend`
> yourself (a plain `restart` or an image update via Watchtower is not enough).
> Verify with `sudo docker exec chara-backend sh -c 'test -n "$ADMIN_API_TOKEN" && echo SET || echo EMPTY'`.
> (The compose *service* is `backend`; `chara-backend` is only the container name.)

## Sending a notification

### Via GitHub (recommended)

Actions → **Send broadcast notification** → **Run workflow** → fill in `title`
and `body` → Run. A `202` means it was queued.

### Via curl

```sh
curl -X POST "$CHARA_API_URL/api/admin/notify" \
  -H "Authorization: Bearer $ADMIN_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Chara 1.2.0","body":"Recurring bills + settle reminders"}'
```

Notes:
- `title` ≤ 100 chars, `body` ≤ 240 chars; both required.
- Optional `"url"` deep-links the tap (e.g. `chara://groups/<server>/<id>/settle`);
  omitted, the tap just opens the app.
- Fires to every device once; there is no per-broadcast rate limit, so keep it
  to genuine release notes.

## Rotating / disabling

- **Rotate**: re-run steps 1–2 with the same commands (the script upserts, and
  `gh secret set` overwrites). Recreate the container to load the new value
  (Watchtower won't — see the callout under step 4):
  `cd /opt/stacks/chara && sudo docker compose up -d backend`.
- **Disable**: remove `ADMIN_API_TOKEN` from the prod `.env` and recreate the
  container — the endpoint returns `404` again.
