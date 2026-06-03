#!/usr/bin/env bash
#
# Seed a demo account with a realistic, populated group so App Store / Play
# Store reviewers can exercise the full app immediately after signing in.
#
# Prerequisite: the target server must have the demo email on its
# DEMO_LOGIN_EMAILS allowlist (see backend/.env.example). That makes the
# magic-link request return the token inline, so this script can sign in with
# no inbox access — exactly the path the reviewer follows in the app.
#
# Usage:
#   ./seed-demo.sh                         # defaults: appstore-review@getchara.app
#   EMAIL=playstore-review@getchara.app NAME="Jordan Ellis" ./seed-demo.sh
#   API_BASE=http://localhost:8080 ./seed-demo.sh
#
# Re-running creates an ADDITIONAL group; it is not idempotent. Delete the old
# demo group first if you want a clean slate.
#
# Requires: curl, jq.
set -euo pipefail

API_BASE="${API_BASE:-https://chara-api.lurkhuset.com}"
EMAIL="${EMAIL:-appstore-review@getchara.app}"
NAME="${NAME:-Jordan Ellis}"
GROUP="${GROUP:-Barcelona Trip 🇪🇸}"
CURRENCY="${CURRENCY:-EUR}"

PROTO_HEADER="X-Chara-App-Protocol: 1"

note() { printf '\033[1;36m▸ %s\033[0m\n' "$*" >&2; }
die()  { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

command -v jq >/dev/null || die "jq is required"

# ── 1. Sign in via the demo bypass ────────────────────────────────────────────
note "Requesting magic link for $EMAIL on $API_BASE"
ml=$(curl -fsS -X POST "$API_BASE/api/auth/magic-link" \
  -H 'Content-Type: application/json' \
  -d "$(jq -nc --arg e "$EMAIL" '{email:$e}')")
raw_token=$(jq -r '.token // empty' <<<"$ml")
[ -n "$raw_token" ] || die "no inline token returned — is $EMAIL on DEMO_LOGIN_EMAILS and the new backend deployed?"

note "Verifying token → JWT"
jwt=$(curl -fsS -X POST "$API_BASE/api/auth/verify" \
  -H 'Content-Type: application/json' \
  -d "$(jq -nc --arg t "$raw_token" '{token:$t}')" | jq -r '.token')
[ -n "$jwt" ] && [ "$jwt" != "null" ] || die "verify failed"

auth=(-H "Authorization: Bearer $jwt" -H "$PROTO_HEADER" -H 'Content-Type: application/json')

# ── 2. Profile + group ────────────────────────────────────────────────────────
note "Setting display name to '$NAME'"
curl -fsS -X PATCH "$API_BASE/api/me" "${auth[@]}" \
  -d "$(jq -nc --arg n "$NAME" '{name:$n}')" >/dev/null

note "Creating group '$GROUP' ($CURRENCY)"
group_id=$(curl -fsS -X POST "$API_BASE/api/groups" "${auth[@]}" \
  -d "$(jq -nc --arg n "$GROUP" --arg c "$CURRENCY" '{name:$n,currency:$c,language:"en"}')" \
  | jq -r '.id')
[ -n "$group_id" ] && [ "$group_id" != "null" ] || die "group create failed"
note "  group_id=$group_id"

# ── 3. Mint the two other members via the import flow (auto-creates ghosts) ───
# Each standing both creates a placeholder member AND records an opening expense,
# giving us balances in both directions out of the gate.
note "Adding members Alex Rivera & Sam Chen (via import)"
curl -fsS -X POST "$API_BASE/api/groups/$group_id/import/commit" "${auth[@]}" -d '{
  "source":"demo",
  "standings":[
    {"name":"Alex Rivera","direction":"owes_you","amount":"45.00","title":"Tapas dinner"},
    {"name":"Sam Chen","direction":"you_owe","amount":"30.00","title":"Airport taxi"}
  ]
}' >/dev/null

# ── 4. Resolve member IDs ─────────────────────────────────────────────────────
members=$(curl -fsS "$API_BASE/api/groups/$group_id" "${auth[@]}" | jq -c '.members')
me_id=$(jq -r '.[] | select(.is_ghost==false) | .id' <<<"$members" | head -1)
alex_id=$(jq -r '.[] | select(.name=="Alex Rivera") | .id' <<<"$members")
sam_id=$(jq -r '.[] | select(.name=="Sam Chen") | .id' <<<"$members")
for v in me_id alex_id sam_id; do [ -n "${!v}" ] || die "could not resolve $v"; done
note "  you=$me_id alex=$alex_id sam=$sam_id"

# ── 5. Richer shared expenses (equal split across all three) ──────────────────
add_expense() { # title amount paid_by category
  curl -fsS -X POST "$API_BASE/api/groups/$group_id/expenses" "${auth[@]}" -d "$(jq -nc \
    --arg t "$1" --arg a "$2" --arg p "$3" --arg c "$4" --arg cur "$CURRENCY" \
    --argjson parts "$(jq -nc --arg a "$me_id" --arg b "$alex_id" --arg c "$sam_id" '[$a,$b,$c]')" \
    '{title:$t,amount:$a,currency:$cur,paid_by_id:$p,split_method:"equal",category:$c,participants:$parts}')" >/dev/null
  note "  + $1 ($2 $CURRENCY)"
}
note "Adding shared expenses"
add_expense "Hotel Sant Jordi (2 nights)" "240.00" "$me_id"   "rent"
add_expense "Groceries — La Boqueria"     "63.00"  "$alex_id" "groceries"
add_expense "Sagrada Família tickets"      "78.00"  "$sam_id"  "other"

# ── 6. A partial settlement (shows in balances + activity) ────────────────────
note "Recording a settlement (Alex → you, 20.00 $CURRENCY)"
curl -fsS -X POST "$API_BASE/api/groups/$group_id/settle" "${auth[@]}" -d "$(jq -nc \
  --arg f "$alex_id" --arg t "$me_id" --arg cur "$CURRENCY" \
  '{from_member_id:$f,to_member_id:$t,amount:"20.00",currency:$cur}')" >/dev/null

# ── 7. Summary ────────────────────────────────────────────────────────────────
note "Done. Balances:"
curl -fsS "$API_BASE/api/groups/$group_id/balances" "${auth[@]}" \
  | jq -r '.[]? | "  \(.name): \(.net_balance) \(.currency)"' || true
