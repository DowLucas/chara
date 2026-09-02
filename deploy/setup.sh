#!/usr/bin/env bash
# Chara self-host setup. Asks a few questions, writes .env, starts everything.
# Safe to re-run: existing secrets are kept; you can change the answers.
set -euo pipefail
cd "$(dirname "$0")"

say()  { printf '\n%s\n' "$*"; }
ask()  { local v; read -r -p "$1 " v </dev/tty; printf '%s' "${v:-$2}"; }
need() { command -v "$1" >/dev/null 2>&1 || { echo "Please install $1 first: $2"; exit 1; }; }
# Read KEY from .env without sourcing it (values may contain shell metachars).
envget() { [ -f .env ] && sed -n "s/^$1=//p" .env | head -n1 | sed 's/^"\(.*\)"$/\1/; s/\\\([\\"$]\)/\1/g' || true; }
# Double-quote a value for .env, escaping what compose's dotenv parser treats specially.
q() { printf '"%s"' "$(printf '%s' "$1" | sed 's/[\\"$]/\\&/g')"; }
is_lan_ip() {
  [[ "$1" =~ ^([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})$ ]] || return 1
  local a=${BASH_REMATCH[1]} b=${BASH_REMATCH[2]}
  [ "$a" = 10 ] || { [ "$a" = 192 ] && [ "$b" = 168 ]; } || { [ "$a" = 172 ] && [ "$b" -ge 16 ] && [ "$b" -le 31 ]; }
}

need docker  "https://docs.docker.com/get-docker/"
docker compose version >/dev/null 2>&1 || { echo "Docker Compose v2 is required (comes with Docker Desktop / docker-compose-plugin)."; exit 1; }
need openssl "it ships with macOS/Linux; on Windows use Git Bash or WSL"

say "👋 Welcome to Chara self-host setup."

if [ -f .env ]; then
  keep=$(ask "A .env already exists. Keep it and just (re)start the stack? [Y/n]" Y)
  case "$keep" in n|N) ;; *) KEEP_ENV=1 ;; esac
fi

if [ -z "${KEEP_ENV:-}" ]; then
  say "1) How will phones reach this server?"
  echo "   a) Over the internet with my own domain (I'll point DNS here; Chara sets up HTTPS for me)"
  echo "   b) Over the internet, behind a reverse proxy I already run (nginx/Traefik/…)"
  echo "   c) Only on my home Wi-Fi (no domain needed)"
  mode=$(ask "Pick a, b or c [c]:" c)
  CHARA_DOMAIN=""; TRUSTED_PROXIES=""; COMPOSE_FILE=docker-compose.yml; PUBLIC=0
  # Which host address the API port is published on. Loopback unless phones have
  # to reach that port directly (mode c) — with a proxy in front, a 0.0.0.0
  # publish would serve the API in cleartext beside it, and Docker writes its own
  # iptables rules, so a host firewall does not close that door for you.
  API_BIND=127.0.0.1
  case "$mode" in
    a|A)
      CHARA_DOMAIN=$(ask "   Your domain (e.g. chara.example.com):" "")
      CHARA_DOMAIN=$(printf '%s' "$CHARA_DOMAIN" | sed -E 's#^https?://##; s#/.*$##' | tr 'A-Z' 'a-z')
      [[ "$CHARA_DOMAIN" =~ ^[a-z0-9.-]+\.[a-z]{2,}$ ]] || { echo "That doesn't look like a domain name (expected something like chara.example.com)."; exit 1; }
      BASE_URL="https://$CHARA_DOMAIN"; COMPOSE_FILE=docker-compose.yml:docker-compose.caddy.yml; PUBLIC=1 ;;
    b|B)
      BASE_URL=$(ask "   Public https URL your proxy serves Chara on (e.g. https://chara.example.com):" "")
      BASE_URL=${BASE_URL%/}
      [[ "$BASE_URL" =~ ^https://[a-zA-Z0-9.-]+(:[0-9]+)?$ ]] || { echo "Must be https://<domain> with no path."; exit 1; }
      TRUSTED_PROXIES=$(ask "   Proxy IP range to trust for X-Forwarded-For [10.0.0.0/8,172.16.0.0/12,192.168.0.0/16]:" "10.0.0.0/8,172.16.0.0/12,192.168.0.0/16"); PUBLIC=1 ;;
    *)
      guess=""
      for cand in $(hostname -I 2>/dev/null || true); do is_lan_ip "$cand" && { guess=$cand; break; }; done
      echo "   Find this machine's Wi-Fi/LAN address (e.g. 192.168.1.10 — on Windows: ipconfig, macOS: System Settings → Wi-Fi)."
      ip=$(ask "   Home-network IP${guess:+ [$guess]}:" "$guess")
      is_lan_ip "$ip" || { echo "'$ip' isn't a home-network IPv4 address (192.168.x.x, 10.x.x.x or 172.16-31.x.x). Names like raspberrypi.local or Tailscale 100.x addresses can't be used over plain http — pick option a or b for those."; exit 1; }
      BASE_URL="http://$ip:8080"; API_BIND=0.0.0.0 ;;
  esac

  say "2) Chara signs people in with a link sent by email. How should it send email?"
  echo "   a) SMTP (Gmail app password, Fastmail, Mailgun, your ISP…)"
  echo "   b) Skip for now — TEST MODE: anyone who types an email is signed straight in, no email sent."
  if [ "$PUBLIC" = 1 ]; then
    echo "      ⚠ Your server will be on the internet: in test mode ANYONE can sign in as ANYONE. Not recommended."
    em=$(ask "Pick a or b [a]:" a)
  else
    echo "      Fine for trying it out on your home Wi-Fi. Re-run ./setup.sh to add SMTP later."
    em=$(ask "Pick a or b [b]:" b)
  fi
  SMTP_HOST=""; SMTP_PORT=587; SMTP_USER=""; SMTP_PASS=""; SMTP_FROM=""; DEV_MODE=false
  case "$em" in
    a|A)
      SMTP_HOST=$(ask "   SMTP host (e.g. smtp.gmail.com):" "")
      SMTP_PORT=$(ask "   SMTP port [587]:" 587)
      SMTP_USER=$(ask "   SMTP username:" "")
      SMTP_PASS=$(ask "   SMTP password:" "")
      SMTP_FROM=$(ask "   From address [${SMTP_USER}]:" "$SMTP_USER") ;;
    *)
      if [ "$PUBLIC" = 1 ]; then
        sure=$(ask "   Really run an internet-facing server in test mode? Type YES to confirm:" "")
        [ "$sure" = YES ] || { echo "Aborted — re-run and pick SMTP."; exit 1; }
      fi
      DEV_MODE=true ;;
  esac

  say "3) Optional: receipt scanning needs a Google Gemini API key (https://aistudio.google.com)."
  GEMINI_API_KEY=$(ask "   Gemini API key (Enter to skip):" "")

  # Keep secrets from a previous run: the Postgres volume was initialised with
  # the old password and a new JWT secret would sign every phone out.
  JWT_SECRET=$(envget JWT_SECRET);               [ -n "$JWT_SECRET" ]          || JWT_SECRET=$(openssl rand -base64 48 | tr -d '\n')
  POSTGRES_PASSWORD=$(envget POSTGRES_PASSWORD); [ -n "$POSTGRES_PASSWORD" ]   || POSTGRES_PASSWORD=$(openssl rand -hex 24)
  MINIO_ROOT_USER=$(envget MINIO_ROOT_USER);     [ -n "$MINIO_ROOT_USER" ]     || MINIO_ROOT_USER=chara
  MINIO_ROOT_PASSWORD=$(envget MINIO_ROOT_PASSWORD); [ -n "$MINIO_ROOT_PASSWORD" ] || MINIO_ROOT_PASSWORD=$(openssl rand -hex 24)

  # Pin the image rather than following `latest`, which moves with every push to
  # main. CI tags every backend build sha-<7 chars>, so the last commit touching
  # backend/ names the image this checkout was cut from. Re-pinned on every run,
  # so `git pull && ./setup.sh` is the update path. No .git (downloaded a
  # tarball)? Fall back to `latest`.
  backend_sha=$(git -C .. log -1 --format=%H -- backend 2>/dev/null || true)
  [ -n "$backend_sha" ] && CHARA_VERSION="sha-${backend_sha:0:7}" || CHARA_VERSION=latest

  {
    echo "# Written by setup.sh on $(date -u +%Y-%m-%d). See .env.example for every option."
    echo "COMPOSE_FILE=$COMPOSE_FILE"
    for k in BASE_URL CHARA_DOMAIN CHARA_VERSION API_BIND JWT_SECRET POSTGRES_PASSWORD MINIO_ROOT_USER MINIO_ROOT_PASSWORD \
             SMTP_HOST SMTP_PORT SMTP_USER SMTP_PASS SMTP_FROM DEV_MODE TRUSTED_PROXIES GEMINI_API_KEY; do
      echo "$k=$(q "${!k}")"
    done
  } > .env
  chmod 600 .env
  say "✅ Wrote .env (secrets generated for you)."
fi

BASE_URL=$(envget BASE_URL); DEV_MODE=$(envget DEV_MODE); CHARA_DOMAIN=$(envget CHARA_DOMAIN)

say "🚀 Starting Chara (first run downloads ~300 MB)…"
if ! docker compose up -d --wait --wait-timeout 180; then
  echo "❌ Something didn't start. Recent logs:"
  docker compose logs --tail=40 chara-api
  exit 1
fi

say "🎉 Chara is running at $BASE_URL"
cat <<NEXT

Connect the app:
  1. Install Chara (App Store / Google Play) and open it.
  2. On the sign-in screen tap  "use my server →"
  3. Type:  $BASE_URL
  4. Enter your email and tap the link you receive.
NEXT
[ "$DEV_MODE" = true ] && echo "     (Test mode: step 4 signs you in immediately — no email is sent.)"
if [ -n "$CHARA_DOMAIN" ]; then
  cat <<CADDY

HTTPS: make sure $CHARA_DOMAIN points at this machine's public IP and ports
80 + 443 are forwarded to it. Caddy fetches the certificate automatically.
CADDY
fi
echo
echo "Useful later (run in this folder):"
echo "  docker compose logs -f                          watch logs"
echo "  docker compose pull && docker compose up -d     update"
echo "  ./setup.sh  →  answer 'n'                       change settings (secrets are kept)"
