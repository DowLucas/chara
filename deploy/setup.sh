#!/usr/bin/env bash
# Chara self-host setup. Asks a few questions, writes .env, starts everything.
# Safe to re-run: an existing .env is kept unless you say otherwise.
set -euo pipefail
cd "$(dirname "$0")"

say()  { printf '\n%s\n' "$*"; }
ask()  { local v; read -r -p "$1 " v </dev/tty; printf '%s' "${v:-$2}"; }
need() { command -v "$1" >/dev/null 2>&1 || { echo "Please install $1 first: $2"; exit 1; }; }

need docker  "https://docs.docker.com/get-docker/"
docker compose version >/dev/null 2>&1 || { echo "Docker Compose v2 is required (comes with Docker Desktop / docker-compose-plugin)."; exit 1; }
need openssl "it ships with macOS/Linux; on Windows use Git Bash or WSL"

say "👋 Welcome to Chara self-host setup."

if [ -f .env ]; then
  keep=$(ask "A .env already exists. Keep it and just (re)start the stack? [Y/n]" Y)
  case "$keep" in n|N) ;; *) KEEP_ENV=1 ;; esac
fi

COMPOSE_FILES=(-f docker-compose.yml)
if [ -z "${KEEP_ENV:-}" ]; then
  say "1) How will phones reach this server?"
  echo "   a) Over the internet with my own domain (I'll point DNS here; Chara sets up HTTPS for me)"
  echo "   b) Over the internet, behind a reverse proxy I already run (nginx/Traefik/…)"
  echo "   c) Only on my home Wi-Fi (no domain needed)"
  mode=$(ask "Pick a, b or c [c]:" c)
  CHARA_DOMAIN=""; TRUSTED_PROXIES=""
  case "$mode" in
    a|A)
      CHARA_DOMAIN=$(ask "   Your domain (e.g. chara.example.com):" "")
      [ -n "$CHARA_DOMAIN" ] || { echo "A domain is required for option a."; exit 1; }
      BASE_URL="https://$CHARA_DOMAIN"; USE_CADDY=1 ;;
    b|B)
      BASE_URL=$(ask "   Public https URL your proxy serves Chara on (e.g. https://chara.example.com):" "")
      case "$BASE_URL" in https://*) ;; *) echo "Must start with https://"; exit 1;; esac
      TRUSTED_PROXIES=$(ask "   Proxy IP range to trust for X-Forwarded-For [10.0.0.0/8,172.16.0.0/12,192.168.0.0/16]:" "10.0.0.0/8,172.16.0.0/12,192.168.0.0/16") ;;
    *)
      guess=$(hostname -I 2>/dev/null | awk '{print $1}' || true)
      ip=$(ask "   This machine's home-network IP [${guess:-192.168.1.10}]:" "${guess:-192.168.1.10}")
      BASE_URL="http://$ip:8080" ;;
  esac

  say "2) Chara signs people in with a link sent by email. How should it send email?"
  echo "   a) SMTP (Gmail app password, Fastmail, Mailgun, your ISP…)"
  echo "   b) Skip for now — TEST MODE: anyone who types an email is signed straight in, no email sent."
  echo "      Fine for trying it out on your home Wi-Fi. Re-run ./setup.sh to add SMTP later."
  em=$(ask "Pick a or b [b]:" b)
  SMTP_HOST=""; SMTP_PORT=587; SMTP_USER=""; SMTP_PASS=""; SMTP_FROM=""; DEV_MODE=false
  case "$em" in
    a|A)
      SMTP_HOST=$(ask "   SMTP host (e.g. smtp.gmail.com):" "")
      SMTP_PORT=$(ask "   SMTP port [587]:" 587)
      SMTP_USER=$(ask "   SMTP username:" "")
      SMTP_PASS=$(ask "   SMTP password:" "")
      SMTP_FROM=$(ask "   From address [${SMTP_USER}]:" "$SMTP_USER") ;;
    *) DEV_MODE=true ;;
  esac

  say "3) Optional: receipt scanning needs a Google Gemini API key (https://aistudio.google.com)."
  GEMINI_API_KEY=$(ask "   Gemini API key (Enter to skip):" "")

  cat > .env <<ENV
# Written by setup.sh on $(date -u +%Y-%m-%d). See .env.example for every option.
BASE_URL=$BASE_URL
CHARA_DOMAIN=$CHARA_DOMAIN
JWT_SECRET=$(openssl rand -base64 48 | tr -d '\n')
POSTGRES_PASSWORD=$(openssl rand -hex 24)
MINIO_ROOT_USER=chara
MINIO_ROOT_PASSWORD=$(openssl rand -hex 24)
SMTP_HOST=$SMTP_HOST
SMTP_PORT=$SMTP_PORT
SMTP_USER=$SMTP_USER
SMTP_PASS=$SMTP_PASS
SMTP_FROM=$SMTP_FROM
DEV_MODE=$DEV_MODE
TRUSTED_PROXIES=$TRUSTED_PROXIES
GEMINI_API_KEY=$GEMINI_API_KEY
USE_CADDY=${USE_CADDY:-0}
ENV
  chmod 600 .env
  say "✅ Wrote .env (secrets generated for you)."
fi

# shellcheck disable=SC1091
set -a; . ./.env; set +a
[ "${USE_CADDY:-0}" = "1" ] && COMPOSE_FILES+=(-f docker-compose.caddy.yml)

say "🚀 Starting Chara (first run downloads ~300 MB)…"
docker compose "${COMPOSE_FILES[@]}" up -d

printf 'Waiting for the API to come up'
for _ in $(seq 1 60); do
  if docker compose "${COMPOSE_FILES[@]}" exec -T chara-api wget -qO- http://localhost:8080/api/health/readiness >/dev/null 2>&1; then
    ok=1; break
  fi
  printf '.'; sleep 2
done
echo
if [ -z "${ok:-}" ]; then
  echo "❌ The API didn't become healthy. Recent logs:"
  docker compose "${COMPOSE_FILES[@]}" logs --tail=40 chara-api
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
if [ "${DEV_MODE:-false}" = "true" ]; then
  echo "     (Test mode: step 4 signs you in immediately — no email is sent.)"
fi
if [ "${USE_CADDY:-0}" = "1" ]; then
  cat <<CADDY

HTTPS: make sure $CHARA_DOMAIN points at this machine's public IP and ports
80 + 443 are forwarded to it. Caddy fetches the certificate automatically.
CADDY
fi
echo
echo "Useful later:  docker compose ${COMPOSE_FILES[*]} logs -f     (watch logs)"
echo "               docker compose ${COMPOSE_FILES[*]} pull && docker compose ${COMPOSE_FILES[*]} up -d   (update)"
