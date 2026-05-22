# Security

*Last reviewed: 22 May 2026*

We take security seriously, but we'd rather under-promise and ship than over-claim. This page describes what is actually in place today, and what is on the roadmap.

## What is in place today

- **Transport**: TLS, terminated at Cloudflare in front of the service.
- **At rest**: provider-level disk encryption on the volumes our Postgres database and object storage live on.
- **Auth**: passwordless. Magic links are random 32-byte tokens, hashed at rest, valid for 15 minutes, single-use. Self-hosted instances can additionally use OIDC against any provider you choose (Authentik, Keycloak, Authelia, Pocket ID, etc.). Hosted accounts can additionally use Sign in with Google or Sign in with Apple.
- **Sessions**: a signed JWT carried in the HTTP `Authorization` header — not a cookie. Tokens are held in the device's secure storage and cleared on sign-out.
- **Receipt access**: receipts in object storage are served through an authenticated proxy route; the backend re-checks group membership on every request. Object URLs are never handed out to the client.
- **Money math**: int64 minor units, decimal strings on the wire. Floats are forbidden.
- **Production access**: limited to the on-call engineer. SSH keys only, no shared accounts.

## What we don't do

- We don't process payments. We won't ever ask for card data.
- We don't load third-party analytics, advertising, or chat widgets on app pages.
- We don't keep raw email content. Outbound mail is transactional; there is no marketing pipeline.
- We don't store contacts, location, or advertising identifiers.

## On the roadmap (not in place yet)

We want to be straight about what we are still working on:

- HSTS preload, CSP, X-Frame-Options, X-Content-Type-Options — none of these are sent by the application server yet. Cloudflare handles some of this at the edge.
- Dependency vulnerability scanning in CI (`govulncheck`, Dependabot). The project does not have CI workflows checked in yet.
- Automatic 30-day rotation of request logs. Today logs stay with the host instance.
- Short-TTL presigned download URLs for receipts as an alternative to the proxy route.
- Documented restore-test cadence for backups.
- In-app account deletion and data export. Currently handled by email to [privacy@chara.app](mailto:privacy@chara.app).

This list is intentionally public. If something here matters to you, let us know — it sharpens prioritisation.

## Self-host security notes

If you self-host, your security is your call. Some things worth doing:

- Put the app behind a reverse proxy with TLS (Caddy is the obvious pick).
- Use a real OIDC provider — Authentik, Keycloak, Authelia, Pocket ID. Don't roll your own auth.
- Restrict the Postgres port to localhost or your private network.
- Rotate the JWT signing secret regularly; back up `./data` regularly.
- If you turn on the Gemini receipt OCR feature, remember that receipt images leave your server and go to Google. The feature is off by default.

## Responsible disclosure

If you find a vulnerability, please email [security@chara.app](mailto:security@chara.app). We aim to respond within 72 hours. We don't run a paid bug bounty yet, but we credit reporters in the changelog with permission. Please don't open public GitHub issues for security findings.
