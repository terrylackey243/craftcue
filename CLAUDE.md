# CraftCue — notes for Claude

Public MIT repo (terrylackey243/craftcue). Static PWA, **no backend**. Spec: `specs/craftcue-spec.md`.
Primary hosting is GitHub Pages; the homelab copy (`craftcue.jkne.app`) is Terry's test instance.

## Running things (host has no Node)

- `./n <cmd>` runs a command in `node:22-alpine` with host networking (bridge containers can't
  resolve DNS on k8plus). E.g. `./n npm test`, `./n npx tsc -b`, `./n npx eslint .`, `./n npx vite build`.
- Playwright: `docker run --rm --network host -u "$(id -u):$(id -g)" -e HOME=/tmp -v "$PWD":/app -w /app mcr.microsoft.com/playwright:v1.63.0-noble npx playwright test`
  (build first; the version tag must match `@playwright/test`).
- Live fixture recording spends real money: see CONTRIBUTING.md. Dev key = calendar-budget's `.env`;
  never commit it or bake it into the build.
- Homelab deploy: `./deploy.sh` (builds the image, restarts via `compose.yml`, which is gitignored).

## Accounts + sync (added 2026-09-28)

- Builds with `VITE_SUPABASE_URL` set get accounts + offline-first sync; builds without it are the
  original on-device-only app (the public GitHub Pages build, for now). See `src/lib/cloud/config.ts`.
- Terry's copy (`craftcue.jkne.app`) uses **self-hosted Supabase** in `/srv/apps/craftcue-supabase`
  (official docker setup, `self-hosted/v0.8.2`, secrets in its `.env`, mode 600). Sign-ups are
  **off** (`DISABLE_SIGNUP=true`); accounts are created with the admin API. Caddy routes
  `/{auth,rest,storage,realtime}/v1/*` on craftcue.jkne.app to the gateway (`craftcue-api` alias on
  the `web` network); nothing else is published (Postgres has no host port; Studio is localhost:3043).
  Build settings for this copy live in the untracked `deploy.env`.
- Schema changes: add a new file in `supabase/migrations/` (never edit an applied one), then
  `../craftcue-supabase/apply-migrations.sh`. It records history like `supabase db push`.
- Tests: `SUPABASE_BIN=~/.local/bin/supabase ./scripts/test-db.sh` (security + e2e sync) and
  `./scripts/test-sync-e2e.sh` (two-device browser test). They start a throwaway local Supabase and
  stop it after. **Don't leave it running**: the CLI publishes its demo-password Postgres on
  0.0.0.0:54322 (LAN-reachable; Docker bypasses ufw).
- Backups: `craftcue-supabase/backup-db.sh` (terry's crontab, 02:00) writes a data-only dump to
  `/srv/storage/ssd1/backups/craftcue-supabase/` before restic runs at 02:30. Restore = fresh stack
  + apply-migrations + `psql` the dump (tested 2026-09-28).
- Plan for later (not built): hosted Supabase Pro, Resend SMTP, 6-digit email codes
  (`VITE_AUTH_METHOD=otp` is already implemented), open sign-ups, privacy policy page.

## Invariants

- `src/lib/ai/aiClient.ts` is the only module that calls Anthropic. Models come from `src/data/models.json`.
- A suggestion is "Make it now" only if `validate.ts` confirms it. Never loosen that to trust the model.
- `uses[].amount` is **per finished item**; sell mode multiplies by the batch size.
- Cutting mats are reusable (`isReusable`) and never deducted.
- Writes go through `src/lib/repo.ts` so the backup-reminder counter stays right.
- Backup format changes: bump `BACKUP_SCHEMA_VERSION` and add a migration; never edit old ones.
- No new outbound hosts without adding them to `CONNECT_SRC` in `vite.config.ts`.
- UI copy is for non-technical crafters: plain words, no jargon, 48px touch targets.
- Machine profiles: `verified: true` only with manufacturer sources. help.cricut.com 403s WebFetch;
  use WebSearch excerpts.
- Never add invented UPCs to `upc-seed.json`.
- Every write to a synced table is captured by the outbox middleware in `src/db.ts`, in the same
  transaction. Writes applied from the server run in a transaction marked with `markRemote()`.
  Never `await` a non-Dexie promise (fetch, crypto.subtle) inside a Dexie transaction: IndexedDB
  commits early.
- The records table has no write policies: all writes go through `sync_push` (security definer,
  always `auth.uid()`). The shared catalog only changes through `submit_product`.
- The Anthropic key (`secrets` table) never syncs and never goes into backups.
- Mixed-color packs = one supply per color sharing `setId`/`setName`; `packSize` on a color is
  that color's count per pack. Photo reading must list only color names it can actually read
  (it invented plausible names from a real Astrobrights photo before that rule), and the app
  re-checks that counts add up to the printed total.
- Outbox entries carry a unique `rev`; never compare timestamps to detect a re-edit (two edits
  can share a millisecond).
