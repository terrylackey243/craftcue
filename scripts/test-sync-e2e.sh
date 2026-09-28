#!/bin/sh
# Build CraftCue with accounts on, start a throwaway local Supabase with sign-ups closed, create
# one test user, and run the two-device browser test. Stops Supabase afterwards.
set -eu
cd "$(dirname "$0")/.."
SUPABASE="${SUPABASE_BIN:-supabase}"
PW_IMAGE="mcr.microsoft.com/playwright:v1.63.0-noble"
$SUPABASE start >/dev/null
trap '$SUPABASE stop >/dev/null 2>&1 || true' EXIT
$SUPABASE db reset >/dev/null
eval "$($SUPABASE status -o env | sed -n 's/^API_URL=/export SB_URL=/p; s/^PUBLISHABLE_KEY=/export SB_PUBLISHABLE_KEY=/p; s/^SECRET_KEY=/export SB_SECRET_KEY=/p')"
export E2E_EMAIL="device-test-$(date +%s)@craftcue.test" E2E_PASSWORD="test-password-123"
curl -sf -X POST "$SB_URL/auth/v1/admin/users" -H "apikey: $SB_SECRET_KEY" -H "Authorization: Bearer $SB_SECRET_KEY" \
  -H 'content-type: application/json' -d "{\"email\":\"$E2E_EMAIL\",\"password\":\"$E2E_PASSWORD\",\"email_confirm\":true}" >/dev/null
export VITE_SUPABASE_URL="$SB_URL" VITE_SUPABASE_PUBLISHABLE_KEY="$SB_PUBLISHABLE_KEY" VITE_SIGNUP=closed VITE_AUTH_METHOD=password
run() {
  if command -v npx >/dev/null 2>&1; then "$@"; else
    docker run --rm -u "$(id -u):$(id -g)" -e HOME=/tmp -e CI -e VITE_SUPABASE_URL -e VITE_SUPABASE_PUBLISHABLE_KEY -e VITE_SIGNUP -e VITE_AUTH_METHOD \
      -e E2E_EMAIL -e E2E_PASSWORD -v "$PWD":/app -w /app --network host "$PW_IMAGE" "$@"
  fi
}
run npx vite build --outDir dist-sync --emptyOutDir
run npx playwright test --config playwright.sync.config.ts
