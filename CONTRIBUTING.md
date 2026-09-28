# Contributing to CraftCue

Thanks for helping! CraftCue is a static React app with no backend, meant for crafters who aren't
technical. Please keep that audience in mind: plain words in the UI, big touch targets, nothing
that needs an account or a server.

## Dev setup

```bash
npm ci
npm run dev        # http://localhost:5173
npm test           # unit tests (Vitest)
npm run lint && npm run typecheck
npm run build && npx playwright install chromium webkit && npm run e2e
```

Stack: Vite + React + TypeScript, Tailwind, Dexie (IndexedDB), @zxing/browser, vite-plugin-pwa,
@anthropic-ai/sdk (browser, user's own key).

### Layout

| Path | What |
|---|---|
| `src/data/machines/*.json` | One file per cutting machine |
| `src/data/tools.json` | Machine tools and what each one enables |
| `src/data/categories.ts` | Supply categories and quick-add templates |
| `src/data/upc-seed.json` | Bundled barcode → product lookups |
| `src/data/models.json`, `pricing.json` | Which Claude model each feature uses, and prices for the cost meter |
| `src/lib/ai/` | Everything that talks to Claude: `aiClient.ts` (the only module that calls the API), prompt building, schemas, validation |
| `src/lib/backup.ts` | Backup format and migrations |
| `tests/unit`, `tests/e2e`, `tests/fixtures` | Tests and recorded API responses |

## Ground rules

- **No telemetry, no accounts, no new outbound hosts.** The only network destinations are
  `api.anthropic.com` (with the user's key) and, if one is ever added, a UPC lookup host. Both
  must be listed in `CONNECT_SRC` in `vite.config.ts`.
- **AI output is a proposal.** Nothing the model says is saved or deducted until the user
  confirms it.
- **Every AI feature has a no-key path.** Use `useAiGate()` so a button opens the setup panel
  instead of failing.
- **Don't break old backups.** If you change what is stored, bump `BACKUP_SCHEMA_VERSION` in
  `src/config.ts` and add a migration in `src/lib/backup.ts` (never edit old migrations). Add a
  Dexie version in `src/db.ts` for schema changes.

## Adding or checking a machine

1. Copy `src/data/machines/cricut-maker-5.json` to a new file named after the machine id.
2. Fill in **only** numbers you can find on the manufacturer's own help or product pages:
   cut width (with and without a mat), longest mat-free cut, maximum material thickness, Print
   Then Cut support, compatible tools.
3. Put those page links in `sourceUrls`.
4. Set `"verified": true` only when every field is backed by a manufacturer page. Otherwise
   leave it `false`: the app will show *details not double-checked yet*.
5. If the machine uses tools that aren't in `src/data/tools.json`, add them there with a
   one-sentence plain-language `plainDescription` and the capabilities they `enable`.

Don't add manufacturer product photos or logos; the app uses a generic machine icon on purpose.

## Adding barcode (UPC) seed entries

`src/data/upc-seed.json` makes common products fill in instantly for everyone.

- **Only add a UPC you have confirmed** from the physical package or a retailer listing that
  shows the barcode. Never guess or generate one.
- Store the product description only: name, category, subtype, brand, color, finish,
  dimensions, unit, adhesive. No quantities, prices or locations.
- Easiest route: scan your own supplies in the app, then Settings → Barcodes → *Share my
  barcodes with the project*. That downloads entries in exactly this format.

```json
{ "upc": "012345678905", "supply": { "name": "Permanent vinyl sampler", "category": "adhesive-vinyl", "brand": "…", "dimensions": "12 x 12 in", "unit": "sheet", "adhesive": "permanent" }, "source": "package" }
```

### Online UPC lookup

`src/lib/upc.ts` has a `UpcLookupProvider` interface, but no provider ships: the lookup runs in
the user's browser, so a provider must allow cross-origin (CORS) requests without a secret key.
If you find one that does, add it to `PROVIDERS`, add its host to `CONNECT_SRC`, and keep it off
by default.

## Working on AI features

- Tests never call the API. They use recorded responses in `tests/fixtures/` through
  `setAiClientForTests()`.
- To re-record fixtures and measure costs with a real key (this spends a few cents):

  ```bash
  ANTHROPIC_API_KEY=sk-ant-… RECORD=1 npx vitest run --config vitest.record.config.ts
  ```

  Put optional test photos at `tests/fixtures/photos/{package,loose,bulk}.jpg`.
- `src/lib/ai/validate.ts` is the safety net: a suggestion only lands in *Make it now* if the app
  itself confirms every supply exists and suffices, and every tool and piece of equipment is owned.
  Keep that true; `tests/unit/validate.test.ts` checks it against the recorded responses.

## Screenshots

The key guide uses `docs/images/key-guide-*.png`. See `docs/images/README.md`. Re-capture them
when the Anthropic Console changes, and redact emails, keys and balances.
