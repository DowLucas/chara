# Run your own Chara server

You need one computer that stays on (a Raspberry Pi, an old laptop, a NAS, a
cheap VPS — anything that runs Docker, Intel or ARM) and about 10 minutes.

## 1. Install Docker

- Mac / Windows: [Docker Desktop](https://docs.docker.com/get-docker/)
- Linux: `curl -fsSL https://get.docker.com | sh`

## 2. Run the setup script

```sh
git clone https://github.com/DowLucas/chara.git
cd chara/deploy
./setup.sh
```

It asks three questions, generates all passwords for you, starts everything
and waits until the server is healthy:

| Question | If you're not sure, pick… |
|----------|---------------------------|
| **How will phones reach this server?** | **c) home Wi-Fi only.** Works instantly, nothing to configure. Pick **a)** once you own a domain and want to use Chara away from home — Chara then gets an HTTPS certificate for you automatically. |
| **How should Chara send email?** | **b) test mode.** Sign-in just works (no email sent). Add SMTP later by re-running `./setup.sh`. |
| **Gemini API key?** | Press Enter to skip. Only needed for receipt scanning. |

At the end it prints the address to type into the app.

## 3. Connect the app

1. Install Chara from the App Store / Google Play and open it.
2. On the sign-in screen tap **use my server →**.
3. Type the address the script printed (e.g. `http://192.168.1.10:8080` or
   `https://chara.example.com`).
4. Enter your email. In test mode you're signed in immediately; with SMTP, tap
   the link in the email.

Friends join the same way — same address — or via an invite link from inside a
group.

## Everyday commands

Run these from the `deploy/` folder. If you chose option **a)** (Caddy/HTTPS),
add `-f docker-compose.yml -f docker-compose.caddy.yml` after `docker compose`
— `./setup.sh` prints the exact command.

| I want to… | Run |
|------------|-----|
| see what's happening | `docker compose logs -f` |
| update to the newest Chara | `docker compose pull && docker compose up -d` |
| stop | `docker compose down` |
| back up | copy the two Docker volumes `deploy_postgres_data` and `deploy_minio_data` (e.g. `docker run --rm -v deploy_postgres_data:/v -v $PWD:/b alpine tar czf /b/postgres.tgz -C /v .`) |
| change a setting | edit `.env`, then `docker compose up -d` |
| start over | `docker compose down -v` (**deletes all data**), then `./setup.sh` |

## Doing it by hand instead

```sh
cp .env.example .env     # fill in everything marked REQUIRED
docker compose up -d
curl http://localhost:8080/api/health/readiness
```

Add-ons, combined with `-f`:

- `docker-compose.caddy.yml` — bundled Caddy reverse proxy with automatic HTTPS.
  Needs `CHARA_DOMAIN` in `.env`, DNS pointing at your machine, and ports 80/443
  forwarded.
- `docker-compose.build.yml` — build the API from this checkout instead of pulling
  `ghcr.io/dowlucas/chara-backend`.

Already have nginx / Traefik / Caddy? Proxy to `127.0.0.1:8080`, set
`BASE_URL=https://your.domain` and `TRUSTED_PROXIES` to your proxy's IP range,
and optionally `API_BIND=127.0.0.1` so the API isn't reachable directly.

Every variable is documented in [`.env.example`](.env.example).

## Rules of thumb

- **`BASE_URL` must be reachable from a phone.** Sign-in links and invites are
  built from it. `localhost` will never work.
- The app only accepts plain `http://` for home-network addresses
  (`192.168.x.x`, `10.x.x.x`, `172.16–31.x.x`). Anything else must be `https://`.
  Tailscale / `.local` names count as "anything else".
- **Test mode (`DEV_MODE=true`) signs anyone in with any email.** Great on your
  Wi-Fi, not for the internet — set up SMTP before you open ports.
- Sign-in on self-hosted servers is by email magic link. (Google/Apple Sign-In
  are hosted-only.)
