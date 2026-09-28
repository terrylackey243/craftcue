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
