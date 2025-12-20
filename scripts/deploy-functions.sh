#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$ROOT_DIR"

echo "== Deploy Supabase Edge Functions =="

if [[ ! -f "supabase/config.toml" ]]; then
  echo "ERROR: supabase/config.toml not found. Run this from the repo root." >&2
  exit 1
fi

if command -v git >/dev/null 2>&1 && git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  if git diff --quiet && git diff --cached --quiet; then
    echo "- git pull (rebase)"
    git pull --rebase --autostash || {
      echo "ERROR: git pull failed. Resolve it and rerun." >&2
      exit 1
    }
  else
    echo "- git pull skipped (working tree not clean)"
  fi
fi

if ! command -v supabase >/dev/null 2>&1; then
  echo "ERROR: Supabase CLI not found. Install: brew install supabase/tap/supabase" >&2
  exit 1
fi

echo "- supabase version: $(supabase --version)"

PROJECT_REF=${SUPABASE_PROJECT_REF:-}
if [[ -z "$PROJECT_REF" && -f supabase/.temp/project-ref ]]; then
  PROJECT_REF=$(tr -d '[:space:]' < supabase/.temp/project-ref)
fi

if [[ -z "$PROJECT_REF" ]]; then
  echo "ERROR: Project is not linked." >&2
  echo "Run: supabase link --project-ref <PROJECT_REF>" >&2
  exit 1
fi

echo "- project ref: $PROJECT_REF"

# Auth sanity check
if ! supabase projects list >/dev/null 2>&1; then
  echo "ERROR: Supabase CLI is not authenticated." >&2
  echo "Fix: export SUPABASE_ACCESS_TOKEN=... (recommended for CI/non-interactive)" >&2
  echo "Or: supabase login (interactive)" >&2
  exit 1
fi

echo "- auth: OK"

# Stamp a build id so webhook logs prove which code is deployed.
BUILD_ID=${BUILD_ID:-}
if [[ -z "$BUILD_ID" ]]; then
  if command -v git >/dev/null 2>&1 && git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    BUILD_ID=$(git rev-parse --short HEAD 2>/dev/null || true)
  fi
fi
BUILD_ID=${BUILD_ID:-manual}
export BUILD_ID
echo "- BUILD_ID: $BUILD_ID"

echo "- setting BUILD_ID secret"
supabase secrets set BUILD_ID="$BUILD_ID" --project-ref "$PROJECT_REF" >/dev/null

# Function sanity checks
for name in server mt-bridge billing stripe-webhook; do
  dir="supabase/functions/$name"
  entry="$dir/index.ts"

  if [[ ! -d "$dir" ]]; then
    echo "ERROR: Missing $dir" >&2
    exit 1
  fi

  if [[ ! -f "$entry" ]]; then
    echo "ERROR: Missing entrypoint $entry" >&2
    echo "Fix: ensure the file exists and is named index.ts (not index.tsx)." >&2
    exit 1
  fi

done

echo "- functions: OK (server, mt-bridge, billing, stripe-webhook)"

DEBUG_FLAGS=()
if [[ "${DEBUG:-}" == "1" || "${SUPABASE_DEBUG:-}" == "1" ]]; then
  DEBUG_FLAGS+=(--debug)
fi

DEPLOY_FLAGS=(--use-api --project-ref "$PROJECT_REF")

deploy_one() {
  local name="$1"
  echo
  echo "== Deploy: $name =="
  local extra_flags=()
  if [[ "$name" == "stripe-webhook" || "$name" == "server" ]]; then
    # Stripe/MetaTrader do not send a Supabase JWT. Disable JWT verification explicitly to avoid 401s.
    extra_flags+=(--no-verify-jwt)
  fi
  if ! supabase functions deploy "$name" "${DEPLOY_FLAGS[@]}" "${DEBUG_FLAGS[@]}" "${extra_flags[@]}"; then
    echo "ERROR: Deploy failed for '$name'." >&2
    echo "Try: supabase functions deploy $name --use-api --project-ref $PROJECT_REF --debug" >&2
    return 1
  fi
}

failed=0
for fn in server mt-bridge billing stripe-webhook; do
  deploy_one "$fn" || failed=1
  # small pause to make logs easier to read
  sleep 1
done

echo
if [[ "$failed" -ne 0 ]]; then
  echo "One or more deployments failed." >&2
  echo "Next steps:" >&2
  echo "- Rerun with debug: DEBUG=1 ./scripts/deploy-functions.sh" >&2
  echo "- Verify linking: supabase link --project-ref $PROJECT_REF" >&2
  exit 1
fi

echo "All functions deployed successfully."
echo "Next: set secrets (examples):"
echo "  supabase secrets set SITE_URL=\"https://your-domain.com\" --project-ref $PROJECT_REF"
