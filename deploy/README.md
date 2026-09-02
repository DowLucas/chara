# Run your own Chara server

You need one computer that stays on (a Raspberry Pi, an old laptop, a NAS, a
cheap VPS — anything that runs Docker, Intel or ARM, including 32-bit
Raspberry Pi OS) and about 10 minutes.

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
| **How should Chara send email?** | On home Wi-Fi: **b) test mode** — sign-in just works, no email sent. On the internet: **a) SMTP** (test mode lets *anyone* sign in as *anyone*, so the script steers you away from it there). A Gmail "app password" is the easiest SMTP to get. |
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

Run these from the `deploy/` folder. (`setup.sh` records which compose files
you use in `.env` via `COMPOSE_FILE`, so plain `docker compose` always does the
right thing, Caddy add-on included.)

| I want to… | Run |
|------------|-----|
| see what's happening | `docker compose logs -f` |
| update to the newest Chara | `git pull && ./setup.sh`, answer **n** — `setup.sh` re-pins `CHARA_VERSION` to the image built from this checkout (secrets and answers are kept). Prefer to track main instead? Set `CHARA_VERSION=latest` in `.env` and `docker compose pull && docker compose up -d` |
| stop | `docker compose down` |
| back up | copy the two Docker volumes `deploy_postgres_data` and `deploy_minio_data` (e.g. `docker run --rm -v deploy_postgres_data:/v -v $PWD:/b alpine tar czf /b/postgres.tgz -C /v .`) |
| change a setting (add SMTP, switch to a domain…) | `./setup.sh`, answer **n** to "keep .env?" — passwords and secrets are kept, only the questions are re-asked |
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
  forwarded. Set `COMPOSE_FILE=docker-compose.yml:docker-compose.caddy.yml` in
  `.env` so it's always included.
- `docker-compose.build.yml` — build the API from this checkout instead of pulling
  `ghcr.io/dowlucas/chara-backend`.

Already have nginx / Traefik / Caddy? Proxy to `127.0.0.1:8080` and set
`BASE_URL=https://your.domain` plus `TRUSTED_PROXIES` to your proxy's IP range.
Leave `API_BIND` on its `127.0.0.1` default: publishing the API on `0.0.0.0`
serves it in cleartext right next to your HTTPS proxy, and Docker's port
publishing goes in ahead of `ufw` / `firewalld`, so a host firewall does not
close that port for you. Only home-Wi-Fi setups, where phones talk to the API
port directly, want `API_BIND=0.0.0.0` — `setup.sh` sets that for you.

If your proxy is itself a container, don't reach for `0.0.0.0`: attach it to the
`deploy_default` network and proxy to `chara-api:8080` instead.

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
