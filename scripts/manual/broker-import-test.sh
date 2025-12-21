#!/usr/bin/env bash
set -euo pipefail

# Manual broker-import smoke test (MetaApi).
#
# Prereqs:
# - You are logged into TJ and have a Supabase user JWT (access token)
# - Supabase secrets set: METAAPI_TOKEN, METAAPI_CLIENT_URL, METAAPI_PROVISIONING_URL
# - Edge Function deployed: broker-import
#
# Usage:
#   export SUPABASE_URL="https://<PROJECT_REF>.supabase.co"
#   export SUPABASE_ANON_KEY="sb_publishable_..."
#   export USER_JWT="eyJ..."
#   export MT_PLATFORM="mt5"
#   export MT_ENVIRONMENT="demo"   # demo|live
#   export MT_SERVER="Exness-MT5Trial"
#   export MT_LOGIN="247939759"
#   export MT_PASSWORD="INVESTOR_PASSWORD"
#   ./scripts/manual/broker-import-test.sh

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "Missing env var: $name" >&2
    exit 1
  fi
}

require_env SUPABASE_URL
require_env SUPABASE_ANON_KEY
require_env USER_JWT
require_env MT_PLATFORM
require_env MT_ENVIRONMENT
require_env MT_SERVER
require_env MT_LOGIN
require_env MT_PASSWORD

BASE="${SUPABASE_URL%/}/functions/v1/broker-import"

echo "== Connect =="
CONNECT_RES=$(
  curl -sS -X POST "$BASE/connect" \
    -H "apikey: $SUPABASE_ANON_KEY" \
    -H "Authorization: Bearer $USER_JWT" \
    -H "Content-Type: application/json" \
    -d "{
      \"platform\": \"${MT_PLATFORM}\",
      \"environment\": \"${MT_ENVIRONMENT}\",
      \"server\": \"${MT_SERVER}\",
      \"login\": \"${MT_LOGIN}\",
      \"password\": \"${MT_PASSWORD}\",
      \"type\": \"cloud-g2\"
    }"
)
echo "$CONNECT_RES"

CONNECTION_ID=$(echo "$CONNECT_RES" | python3 - <<'PY'
import json,sys
data=json.load(sys.stdin)
print((data.get("data") or {}).get("connection", {}).get("id") or "")
PY
)

if [[ -z "$CONNECTION_ID" ]]; then
  echo "ERROR: Could not extract connectionId from response." >&2
  exit 1
fi

echo
echo "== Import =="
curl -sS -X POST "$BASE/import" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $USER_JWT" \
  -H "Content-Type: application/json" \
  -d "{ \"connectionId\": \"${CONNECTION_ID}\" }"
echo

echo
echo "== Status =="
curl -sS "$BASE/status" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $USER_JWT"
echo
