#!/bin/sh
# Start a throwaway local Supabase, run the security + sync tests against it, then stop it.
# Needs Docker and the Supabase CLI. In CI the stack runs on the job's own machine.
set -eu
cd "$(dirname "$0")/.."
SUPABASE="${SUPABASE_BIN:-supabase}"
$SUPABASE start >/dev/null
# Rebuild the database from the migrations every run, so tests always see the current schema.
$SUPABASE db reset >/dev/null
trap '$SUPABASE stop >/dev/null 2>&1 || true' EXIT
eval "$($SUPABASE status -o env | sed -n 's/^API_URL=/export SB_URL=/p; s/^PUBLISHABLE_KEY=/export SB_PUBLISHABLE_KEY=/p; s/^SECRET_KEY=/export SB_SECRET_KEY=/p')"
# Locally the host has no Node, so run vitest through the Docker wrapper when needed.
if command -v npx >/dev/null 2>&1; then
  npx vitest run --config vitest.db.config.ts
else
  docker run --rm -u "$(id -u):$(id -g)" -e HOME=/tmp -e SB_URL -e SB_PUBLISHABLE_KEY -e SB_SECRET_KEY -v "$PWD":/app -w /app --network host node:22-alpine npx vitest run --config vitest.db.config.ts
fi
