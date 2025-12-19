#!/usr/bin/env bash
set -euo pipefail

# Quick verification that Stripe webhooks are NOT blocked by Supabase JWT verification.
# Expected result: HTTP 400 (invalid signature) — NOT 401.
#
# Usage:
#   PROJECT_REF=rxzugjqmmcpzwxtecceb ./scripts/test-webhook.sh
# or:
#   ./scripts/test-webhook.sh rxzugjqmmcpzwxtecceb

PROJECT_REF="${1:-${PROJECT_REF:-}}"
if [[ -z "$PROJECT_REF" ]]; then
  echo "ERROR: Missing PROJECT_REF" >&2
  echo "Usage: PROJECT_REF=<ref> ./scripts/test-webhook.sh" >&2
  echo "   or: ./scripts/test-webhook.sh <ref>" >&2
  exit 1
fi

URL="https://${PROJECT_REF}.supabase.co/functions/v1/stripe-webhook"

echo "== POST (no Authorization header) =="
echo "- URL: $URL"
echo "- Expected: HTTP 400 with {\"error\":\"Invalid Stripe-Signature header.\"} (or 400 invalid signature)"
echo

curl -sS -D /tmp/stripe_webhook_headers.txt -o /tmp/stripe_webhook_body.txt \
  -X POST \
  -H 'Content-Type: application/json' \
  --data '{"id":"evt_test","type":"checkout.session.completed","data":{"object":{}}}' \
  "$URL" || true

echo "---- response headers ----"
cat /tmp/stripe_webhook_headers.txt | sed -n '1,20p'
echo "---- response body ----"
cat /tmp/stripe_webhook_body.txt
echo

STATUS=$(awk 'NR==1{print $2}' /tmp/stripe_webhook_headers.txt 2>/dev/null || true)
if [[ "$STATUS" == "401" ]]; then
  echo "FAIL: Got HTTP 401. JWT verification is still enabled for this function." >&2
  echo "Fix: ensure verify_jwt=false is applied and redeploy stripe-webhook." >&2
  exit 2
fi

if [[ "$STATUS" != "400" && "$STATUS" != "200" && "$STATUS" != "405" ]]; then
  echo "WARN: Unexpected HTTP status: ${STATUS:-unknown}" >&2
fi

echo "OK: Endpoint is reachable without Authorization (status ${STATUS:-unknown})."
