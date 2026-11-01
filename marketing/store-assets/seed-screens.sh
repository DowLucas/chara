#!/usr/bin/env bash
#
# Seed the screenshot dataset on a LOCAL backend: one account whose groups and
# numbers match the store copy. The email must be on the backend's
# DEMO_LOGIN_EMAILS allowlist.
#
#   ./seed-screens.sh                  # apartment + barcelona + bookclub + categorize
#   ./seed-screens.sh settle           # pay off Apartment 5B, for the "settled" pages
#   ./seed-screens.sh bookclub         # any single step by name
#
# Steps: apartment (USD, open balances, recurring rules), barcelona (EUR, you're
# owed), bookclub (USD, you owe), categorize, settle. Not idempotent: every group step adds
# a new group. Requires curl, jq.
set -euo pipefail

API_BASE="${API_BASE:-http://localhost:8080}"
EMAIL="${EMAIL:-screens@example.com}"
NAME="${NAME:-Lucas}"

jwt=$(curl -fsS -X POST "$API_BASE/api/auth/magic-link" -H 'Content-Type: application/json' \
  -d "$(jq -nc --arg e "$EMAIL" '{email:$e}')" | jq -r '.token // empty')
[ -n "$jwt" ] || { echo "no inline token — is $EMAIL on DEMO_LOGIN_EMAILS?" >&2; exit 1; }
jwt=$(curl -fsS -X POST "$API_BASE/api/auth/verify" -H 'Content-Type: application/json' \
  -d "$(jq -nc --arg t "$jwt" '{token:$t}')" | jq -r '.token')
auth=(-H "Authorization: Bearer $jwt" -H "X-Chara-App-Protocol: 1" -H 'Content-Type: application/json')
api() { curl -fsS "${auth[@]}" "$@"; }

member_id() { # group_id name
  api "$API_BASE/api/groups/$1" | jq -r --arg n "$2" '.members[] | select(.name==$n) | .id'
}
me_id() { # group_id
  api "$API_BASE/api/groups/$1" | jq -r '.members[] | select(.is_ghost==false) | .id' | head -1
}
group_id() { # name prefix
  api "$API_BASE/api/groups" | jq -r --arg p "$1" '.[] | select(.name|startswith($p)) | .id' | head -1
}
balances() { # group_id
  api "$API_BASE/api/groups/$1/balances" | jq -r '.[] | "  \(.name): \(.net_balance) \(.currency)"'
}
group() { # name currency standings-json -> group_id; the import mints the ghost members
  local gid
  gid=$(api -X POST "$API_BASE/api/groups" -d "$(jq -nc --arg n "$1" --arg c "$2" '{name:$n,currency:$c,language:"en"}')" | jq -r '.id')
  api -X POST "$API_BASE/api/groups/$gid/import/commit" -d "{\"source\":\"demo\",\"standings\":$3}" >/dev/null
  echo "$gid"
}
expense() { # group_id currency title amount paid_by date participants...
  local gid=$1 cur=$2 title=$3 amount=$4 payer=$5 date=$6; shift 6
  api -X POST "$API_BASE/api/groups/$gid/expenses" -d "$(jq -nc --arg t "$title" --arg a "$amount" --arg c "$cur" \
    --arg p "$payer" --arg d "$date" --argjson parts "$(printf '%s\n' "$@" | jq -R . | jq -sc .)" \
    '{title:$t,amount:$a,currency:$c,paid_by_id:$p,split_method:"equal",category:"other",expense_date:$d,participants:$parts}')" >/dev/null
}
settle() { # group_id from to amount currency
  api -X POST "$API_BASE/api/groups/$1/settle" -d "$(jq -nc --arg f "$2" --arg t "$3" --arg a "$4" --arg c "$5" \
    '{from_member_id:$f,to_member_id:$t,amount:$a,currency:$c}')" >/dev/null
}
recurring() { # group_id title amount_minor paid_by freq_unit interval start_date
  api -X POST "$API_BASE/api/groups/$1/recurring" -d "$(jq -nc --arg t "$2" --argjson a "$3" --arg p "$4" \
    --arg u "$5" --argjson i "$6" --arg s "$7" --argjson splits "$(api "$API_BASE/api/groups/$1" | jq -c '[.members[] | {member_id:.id, value:0}]')" \
    '{title:$t,amount_minor:$a,paid_by_id:$p,split_method:"equal",splits:$splits,category:"rent",freq_unit:$u,freq_interval:$i,start_date:$s,timezone:"America/New_York",fire_local_time:"09:00"}')" >/dev/null
}

step_apartment() {
  local gid me nora owen
  gid=$(group "Apartment 5B 🏠" USD '[
    {"name":"Nora Patel","direction":"owes_you","amount":"12.50","title":"Movie tickets"},
    {"name":"Owen Clark","direction":"owes_you","amount":"18.00","title":"Pizza night"}]')
  me=$(me_id "$gid"); nora=$(member_id "$gid" "Nora Patel"); owen=$(member_id "$gid" "Owen Clark")
  expense "$gid" USD "Internet — October"   59.99  "$me"   2026-10-05 "$me" "$nora" "$owen"
  expense "$gid" USD "Electricity bill"     86.75  "$nora" 2026-10-12 "$me" "$nora" "$owen"
  expense "$gid" USD "New coffee maker"     74.99  "$owen" 2026-10-16 "$me" "$nora" "$owen"
  expense "$gid" USD "Weekly groceries"     128.40 "$me"   2026-10-20 "$me" "$nora" "$owen"
  expense "$gid" USD "Friday takeout"       42.60  "$me"   2026-10-23 "$me" "$nora" "$owen"
  expense "$gid" USD "Paper towels & soap"  23.80  "$nora" 2026-10-25 "$me" "$nora" "$owen"
  settle "$gid" "$nora" "$me" 30.00 USD
  # rules start next month, so they don't move today's balances; the app lists
  # newest first, so Rent goes in last to lead the list
  recurring "$gid" "Streaming bundle" 1749   "$owen" month 1 2026-11-12
  recurring "$gid" "Cleaning"         9000   "$nora" week  2 2026-11-03
  recurring "$gid" "Internet"         5999   "$me"   month 1 2026-11-05
  recurring "$gid" "Rent"             240000 "$me"   month 1 2026-11-01
  balances "$gid"
}

step_barcelona() {
  local gid me alex sam
  gid=$(group "Barcelona Trip 🇪🇸" EUR '[
    {"name":"Alex Rivera","direction":"owes_you","amount":"45.00","title":"Tapas dinner"},
    {"name":"Sam Chen","direction":"you_owe","amount":"30.00","title":"Airport taxi"}]')
  me=$(me_id "$gid"); alex=$(member_id "$gid" "Alex Rivera"); sam=$(member_id "$gid" "Sam Chen")
  expense "$gid" EUR "Hotel Sant Jordi (2 nights)" 240.00 "$me"   2026-09-26 "$me" "$alex" "$sam"
  expense "$gid" EUR "Groceries — La Boqueria"     63.00  "$alex" 2026-09-27 "$me" "$alex" "$sam"
  expense "$gid" EUR "Sagrada Família tickets"     78.00  "$sam"  2026-09-27 "$me" "$alex" "$sam"
  settle "$gid" "$alex" "$me" 20.00 EUR
  balances "$gid"
}

step_bookclub() { # the one group where you owe, so home shows every state
  local gid me maya jonah
  gid=$(group "Book Club 📚" USD '[
    {"name":"Maya Lin","direction":"you_owe","amount":"12.40","title":"Book order"},
    {"name":"Jonah Reyes","direction":"you_owe","amount":"9.00","title":"Coffee"}]')
  me=$(me_id "$gid"); maya=$(member_id "$gid" "Maya Lin"); jonah=$(member_id "$gid" "Jonah Reyes")
  expense "$gid" USD "Wine & snacks" 36.00 "$jonah" 2026-10-21 "$me" "$maya" "$jonah"
  balances "$gid"
}

step_categorize() { # real categories, so the monthly summary's breakdown means something
  local map='{"Internet — October":"utilities","Electricity bill":"utilities","New coffee maker":"shopping",
    "Weekly groceries":"groceries","Friday takeout":"food","Paper towels & soap":"groceries",
    "Movie tickets":"entertainment","Pizza night":"food","Hotel Sant Jordi (2 nights)":"travel",
    "Groceries — La Boqueria":"groceries","Sagrada Família tickets":"entertainment","Tapas dinner":"food",
    "Airport taxi":"transport","Book order":"shopping","Coffee":"drinks","Wine & snacks":"drinks"}'
  local gid id cat
  for gid in $(api "$API_BASE/api/groups" | jq -r '.[].id'); do
    api "$API_BASE/api/groups/$gid/expenses" | jq -r --argjson m "$map" \
      '(.expenses? // .items? // .)[] | select($m[.title]) | "\(.id) \($m[.title])"' |
    while read -r id cat; do
      api -X PATCH "$API_BASE/api/groups/$gid/expenses/$id" -d "$(jq -nc --arg c "$cat" '{category:$c}')" >/dev/null
    done
  done
}

step_settle() { # everyone who owes in Apartment 5B pays you back
  local gid me
  gid=$(group_id "Apartment 5B"); me=$(me_id "$gid")
  api "$API_BASE/api/groups/$gid/balances" | jq -r --arg me "$me" \
    '.[] | select(.member_id!=$me and (.net_balance|tonumber) < 0) | "\(.member_id) \(.net_balance|ltrimstr("-")) \(.currency)"' |
  while read -r from amount cur; do settle "$gid" "$from" "$me" "$amount" "$cur"; done
  balances "$gid"
}

api -X PATCH "$API_BASE/api/me" -d "$(jq -nc --arg n "$NAME" '{name:$n}')" >/dev/null
for step in "${@:-apartment barcelona bookclub categorize}"; do
  for s in $step; do "step_$s"; done
done
