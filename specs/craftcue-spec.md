# Craft Stash Project Recommender — Build Spec

> **Final name: CraftCue** (chosen 2026-09-28; the working title below was "Stash & Make").
> Build decisions made during implementation are recorded at the end of this file.
>
> Audience: everyday crafters with cutting machines, little or no technical knowledge
> License: MIT, public GitHub repo
> Status: v1 spec for Claude Code

---

## 1. What this app is

A browser app that lets a crafter:

1. **Inventory** their supplies (vinyl, cardstock, blanks, embellishments, etc.), the **tools** they own for their machine, and their **equipment** (heat press, printer, etc.).
2. **Get project suggestions** based on what they actually have, for one of three goals:
   - **Sell** (craft fair, Etsy, local market)
   - **Decorate** (a room, a season, a holiday)
   - **Gift** (a specific person or occasion)
3. **Track projects** from idea to made, and **deduct used supplies** from inventory when a project is marked made.

The gap it fills: existing craft inventory apps only track supplies, and Cricut's AI Project Designer designs from a description but doesn't know what's in your stash or which tools you own. This app answers the question *"what should I make with what I already have?"*

It **does not** create cut files or talk to Design Space (no public API). It recommends and explains; the user builds the design in Design Space (or equivalent).

---

## 2. Guiding principles

- **Non-technical users first.** Plain language everywhere, no jargon, big touch targets, readable fonts, and nothing to install to get started.
- **Useful without AI.** Inventory, scanning, projects, and backup all work with no API key. AI features light up once a key is added.
- **Your data stays with you.** No backend, no accounts, no telemetry, no analytics. Data lives in the user's browser. The only outbound calls are to the Anthropic API (when configured) and optional UPC lookup.
- **Machine-agnostic.** Cricut Maker 5 is the reference machine, but machines are data files so any cutter can be supported.
- **Suggestions are proposals.** Nothing AI-generated is saved or deducted without the user confirming it.

---

## 3. Architecture

### 3.1 Shape
- **Static single-page PWA.** No server-side code.
- Primary distribution: **hosted on GitHub Pages** (built by GitHub Actions on push to `main`). Users open a URL and optionally "Add to Home Screen."
- Secondary: **Dockerfile** (nginx serving the static build) + example `compose.yml` for self-hosters. Keep it generic: no external networks, no reverse proxy config in the repo. Personal deployment overrides live outside the repo.
- Later (Phase 5, not v1): desktop wrapper (Tauri) for a downloadable installer — this is the "zip drive / paid convenience" option.

### 3.2 Stack
- Vite + React + TypeScript
- Tailwind CSS
- **Dexie** (IndexedDB) for all storage
- **@zxing/browser** for barcode scanning (do not rely on the native `BarcodeDetector` API — unsupported in Safari)
- **vite-plugin-pwa** for install + offline shell
- **@anthropic-ai/sdk** in the browser with `dangerouslyAllowBrowser: true` (the key is the user's own, used on their own device). Wrap it in a single `aiClient` module so it can be mocked in tests and swapped later.
- Vitest + React Testing Library; Playwright for a small smoke suite

### 3.3 Storage and durability
- Call `navigator.storage.persist()` on first run and show the result in Settings ("Your browser has agreed to keep your data" / "Your browser may clear data if space is low — keep backups").
- iPad/iPhone browsers can evict data. Mitigate with:
  - One-tap **Export backup** (single `.json` file including thumbnails as compressed data URLs).
  - **Import backup** (replace or merge).
  - A gentle **backup reminder** after N changes or N days since last backup (configurable, default 50 changes / 14 days).
- Photos: store **thumbnails only** (max ~400px, JPEG ~0.7). Full-size photos are used transiently for vision calls and discarded.

### 3.4 Security
- API key stored in IndexedDB; never logged, never shown back in full (show `sk-ant-…XXXX`).
- **"Forget my key"** button in Settings.
- Content-Security-Policy `connect-src` limited to `self`, `https://api.anthropic.com`, and any enabled UPC lookup host.
- Setup screen warns: don't save your key on a shared or public computer.

---

## 4. Data model

All IDs are UUIDs. Every record has `createdAt`, `updatedAt`.

### 4.1 Supply
| Field | Notes |
|---|---|
| `name` | "Glossy permanent vinyl" |
| `category` | enum, see 4.2 |
| `subtype` | free text, e.g. "permanent", "holographic", "65 lb" |
| `brand` | optional |
| `color` | optional, free text |
| `finish` | optional (matte, glossy, glitter, metallic…) |
| `dimensions` | optional free text ("12 x 12 in", "12 in x 10 ft roll", "11 oz mug") |
| `quantity` | number |
| `unit` | enum: `sheet`, `roll`, `ft`, `yd`, `piece`, `pack`, `blank`, `bottle`, `other` |
| `adhesive` | optional enum: none / removable / permanent / iron-on / self-adhesive |
| `upc` | optional |
| `unitCost` | optional, per unit |
| `location` | optional ("craft room, bin 3") |
| `thumbnail` | optional data URL |
| `notes` | optional |
| `source` | `manual` / `barcode` / `vision` / `import` |

### 4.2 Supply categories (seed list, user can add)
Adhesive vinyl · Iron-on / HTV · Infusible ink · Cardstock & paper · Printable (sticker paper, printable vinyl) · Fabric · Felt · Leather & faux leather · Wood & chipboard · Acrylic · Metal blanks · Foil sheets · Blanks: apparel · Blanks: drinkware · Blanks: home (pillows, totes, coasters) · Embellishments (googly eyes, rhinestones, ribbon, buttons) · Adhesives & glue · Paint & markers · Transfer tape & mats · Other

### 4.3 MachineProfile (JSON files in `/src/data/machines/`)
```json
{
  "id": "cricut-maker-5",
  "brand": "Cricut",
  "name": "Maker 5",
  "cutWidthIn": 12,
  "maxMaterialThicknessMm": 3,
  "matlessSmartMaterials": true,
  "printThenCut": true,
  "compatibleTools": ["fine-point-cutting-tool", "knife-blade", "rotary-blade", "scoring-tool", "engraving-tool", "debossing-tool", "foil-transfer-tool", "pen-holder", "..."],
  "defaultTools": ["fine-point-cutting-tool"],
  "notes": ["Older Maker pens are not compatible with the Maker 5 pen holder."],
  "verified": true,
  "sourceUrls": ["https://help.cricut.com/..."]
}
```
- v1 profiles: **Cricut Maker 5** (verified), plus **Generic cutter** (user enters width/thickness manually).
- Phase 4: Maker 3, Maker 4, Explore series, Joy series, others. **Every spec must be verified against the manufacturer's help center**; set `verified: false` until done.

### 4.4 ToolDefinition (`/src/data/tools.json`)
`id`, `name`, `enables` (e.g. `["cut-fabric-unbonded"]`, `["cut-wood-up-to-3mm"]`, `["engrave-metal", "engrave-acrylic"]`), `plainDescription` ("Cuts fabric without backing — great for quilting and felt projects").

### 4.5 UserSetup (singleton)
`machineId`, `ownedToolIds[]`, `equipment[]` (enum list: heat press, mini heat press, mug press, inkjet printer, laminator, sewing machine, 3D printer, other + free text), `skillLevel` (beginner / comfortable / experienced), `interests[]` (free tags), `aiEnabled`, `models` (see 7.4), `backupReminder` settings.

### 4.6 UpcCacheEntry
`upc` (key), `proposedSupply` (partial Supply fields), `confirmedAt`, `timesUsed`.

### 4.7 Person (for gifts, optional)
`name`, `relationship`, `ageRange`, `interests[]`, `notes`, `pastGiftProjectIds[]` (so we don't suggest the same thing twice).

### 4.8 Project
| Field | Notes |
|---|---|
| `title`, `summary` | |
| `goal` | `sell` / `decor` / `gift` |
| `goalContext` | the request inputs that produced it |
| `personId` | optional |
| `status` | `idea` / `planned` / `made` / `dismissed` |
| `uses[]` | `{ supplyId, amount, unit }` |
| `missing[]` | `{ item, why, estCost }` |
| `toolsNeeded[]`, `equipmentNeeded[]` | |
| `steps[]` | short plain-language steps |
| `designTips` | Design Space search terms / operations |
| `sellInfo` | optional `{ unitCostEst, priceLow, priceHigh, batchNotes }` |
| `safetyNotes[]` | |
| `userNotes`, `photoThumb` | |
| `aiGenerated` | bool |
| `madeAt`, `madeCount` | |

### 4.9 UsageLog
Per AI call: `timestamp`, `feature` (recommend / vision-intake), `model`, `inputTokens`, `outputTokens`. Used for the in-app cost meter.

---

## 5. Screens

1. **First-run setup wizard** (section 6)
2. **Home** — three big buttons: *Something to sell* · *Decorate* · *Make a gift*. Below: "Add supplies" and recent projects.
3. **Inventory** — searchable, filterable by category/location, grid or list. Quick +/- quantity. Low-quantity badge.
4. **Add supply** — choose: *Scan barcode* · *Take a photo* · *Type it in*. (Section 8.)
5. **Bulk add** — photo of a shelf/pile → multiple proposed items → review list → save all.
6. **Suggestions** — results grouped: **"Make it now"** and **"Needs one more thing"**. Card per suggestion, save / dismiss / "more like this."
7. **Project detail** — materials (linked to inventory), missing items (→ shopping list), steps, design tips, sell info, safety notes. **Mark as made** → review deductions → confirm.
8. **Shopping list** — aggregated `missing[]` from saved projects + low-stock items. Shareable as plain text.
9. **People** — saved gift recipients.
10. **Settings** — machine & tools, equipment, AI key + model + usage meter, backup/restore, storage status, reset app, about/licenses/disclaimer.
11. **Help** — plain-language guides, including the AI key guide with screenshots.

---

## 6. First-run setup wizard

Every step skippable except step 1; all editable later in Settings.

1. **Welcome** — one sentence about what the app does; "Your data stays on this device."
2. **Your machine** — pick from profiles (generic icons only, no manufacturer product photos or logos).
3. **Your tools** — checklist of compatible tools for that machine, with plain descriptions. Default tools pre-checked.
4. **Your equipment** — heat press, printer, etc.
5. **About you** — skill level, interests (optional).
6. **Turn on smart suggestions (optional)** — explains that suggestions and photo recognition use Claude from Anthropic, which needs the user's own key and costs a small amount per use. "Set it up now" or "Maybe later." (Section 7.)
7. **Add your first supplies** — jump into Add supply.

---

## 7. AI setup and usage

### 7.1 No-key mode
All AI buttons still appear but open a friendly panel: "Smart suggestions need a quick one-time setup" → guide. Never a dead button or an error.

### 7.2 Key setup guide (in-app, with screenshots)
Step by step: create an Anthropic Console account → add billing/credits → **set a monthly spending limit (recommended)** → create an API key → paste it here. Include a realistic cost note, filled in with measured numbers after Phase 2 (e.g., "about X cents per round of suggestions").

- **Test key** button: cheapest possible call; clear success/failure messages in plain English (invalid key, no credits, network problem).
- Screenshots live in `/docs/images/` and are reused by the README. Mark them for re-capture when the console UI changes.

### 7.3 Usage meter
Settings shows "This month: N suggestions, M photo scans, about $X.XX." Price per million tokens comes from `/src/data/pricing.json` (editable; note it's an estimate).

### 7.4 Models
Configurable in `/src/data/models.json`, not hardcoded:
- Recommendations: default `claude-sonnet-5`
- Vision intake: default `claude-haiku-4-5-20251001` (cheaper; escalate to the recommendation model on a "try harder" button)
Settings exposes a simple "Quality: Standard / Best" toggle rather than model names.

---

## 8. Supply intake

All paths end in the same **prefilled Supply form** the user confirms. Uncertain fields are highlighted.

### 8.1 Barcode flow
1. Scan with camera (@zxing/browser). Manual UPC entry fallback.
2. **Local UPC cache** hit → prefill instantly → user confirms quantity → done. No network call.
3. **Bundled seed file** (`/src/data/upc-seed.json`, common craft-brand products) hit → prefill → confirm → cache.
4. **Optional online lookup** (off by default, behind an adapter interface `UpcLookupProvider`). Verify CORS works from the browser before enabling any provider; if none work client-side, ship without one.
5. Miss → "Take a quick photo of the package" → vision flow (8.2) with the UPC attached → confirm → cache under that UPC.

### 8.2 Package photo (vision)
- Compress client-side (long edge ≤ 1568px, JPEG) before sending.
- Ask the model for structured output (tool use / JSON schema) matching Supply fields, plus `confidence` per field and any UPC digits it can read.
- Prefill the form; flag low-confidence fields.

### 8.3 Loose item photo
Same as 8.2 but prompt acknowledges there's no label: name, category, color, finish, rough size. Quantity/length always flagged as "please check."

### 8.4 Bulk photo
One photo, many items → list of proposed Supplies → review screen with per-row edit/remove → "Save all." This is the key onboarding feature for users with a big existing stash.

### 8.5 Manual
Form with category-specific quick templates (e.g., choosing "Adhesive vinyl" suggests units `sheet`/`roll` and common sizes).

---

## 9. Recommendations

### 9.1 Request inputs by goal
- **Sell:** where (craft fair / online / local shop / not sure), how many to make, price range target (optional), theme/season (optional).
- **Decor:** room, season or holiday, style words (farmhouse, modern, whimsical…), size constraints (optional).
- **Gift:** pick a saved Person or describe them (relationship, age range, interests), occasion, budget for extra supplies (optional).
- Common: "Only use what I have" toggle, difficulty cap, time available, number of ideas (default 5).

### 9.2 Context sent to the model
- Machine profile (capabilities + limits), owned tools with `enables`, equipment.
- Inventory as **compact lines**: `id | name | category | color | qty unit | dims`. If the inventory is large (> ~300 items), group by category and prioritize items with quantity > 0 and categories relevant to the goal. Use prompt caching for the inventory/machine block where available.
- Goal inputs, skill level, interests.
- For gifts: titles of past projects for that person (avoid repeats).

### 9.3 Output (enforced via tool use / JSON schema)
```json
{
  "suggestions": [{
    "title": "", "summary": "", "whyItFits": "",
    "difficulty": 1, "estMinutes": 45,
    "uses": [{ "supplyId": "", "amount": 1, "unit": "sheet" }],
    "missing": [{ "item": "", "why": "", "estCost": "" }],
    "toolsNeeded": [], "equipmentNeeded": [],
    "steps": [], "designTips": "",
    "sellInfo": { "unitCostEst": "", "priceLow": "", "priceHigh": "", "batchNotes": "" },
    "safetyNotes": []
  }]
}
```

### 9.4 Prompt rules (system prompt must include)
- Only reference `supplyId`s from the provided list; anything else goes in `missing`.
- Never require a tool the user doesn't own or exceed machine limits (width, thickness). If a great idea needs one, put it in `missing` and say so.
- Respect "only use what I have" (then `missing` must be empty).
- Plain, friendly language suited to the stated skill level.
- `designTips` suggests search terms and operations (cut / draw / score / engrave / Print Then Cut), not specific copyrighted images.
- **Sell mode: never suggest licensed characters, sports teams, brand logos, or copyrighted quotes/lyrics** — briefly note why if the user's theme implies one.
- Add safety notes where relevant (food-contact surfaces, heat, sharp edges, small parts for young children).

### 9.5 Validation (app side, after the response)
- Drop or move to `missing` any `supplyId` not in inventory.
- Flag any `toolsNeeded` not owned; move the suggestion to "Needs one more thing."
- Check amounts against available quantity; if insufficient, mark as needing more.
- Classify each suggestion: **Make it now** (no missing, all tools owned, quantities OK) vs **Needs one more thing**.
- If the response fails schema validation, retry once, then show a friendly error.

### 9.6 Mark as made
Show proposed deductions from `uses[]` (editable amounts, including "made N of these") → confirm → update quantities, set status `made`, record `madeAt`/`madeCount`, link to Person if a gift.

---

## 10. Distribution and project hygiene

- `README.md` for crafters (what it is, open the link, screenshots, privacy statement, AI setup guide link).
- `CONTRIBUTING.md` for developers (dev setup, how to add a machine profile, how to add UPC seed entries).
- GitHub Actions: lint, test, build, deploy to Pages.
- `Dockerfile` + `compose.example.yml` (generic).
- Disclaimer in app and README: not affiliated with or endorsed by Cricut; brand names used only to describe compatibility.
- Versioned backups: backup JSON includes `schemaVersion`; imports migrate forward.
- Optional support link (e.g., "buy me a coffee") in About — config value, empty by default.

---

## 11. Build phases and acceptance criteria

### Phase 1 — Inventory core (no AI)
- Setup wizard steps 1–5 and 7; Maker 5 + Generic profiles; tools & equipment.
- Inventory CRUD, categories, search/filter, quick quantity edits.
- Manual add with templates.
- Backup export/import, persistence request, backup reminder.
- PWA installable; works offline.
- **Done when:** a new user can set up, add 20 items by hand, export, clear site data, import, and see everything restored — on iPad Safari and desktop Chrome.

### Phase 2 — Recommendations
- AI key setup + test key + guide (screenshots can be placeholders), no-key mode panels.
- All three goal flows, People, validation, grouping, saved projects, mark-as-made deductions, shopping list.
- Usage meter.
- **Done when:** with a 30-item test inventory and Maker 5 + fine point + scoring tools only, no suggestion in "Make it now" requires an unowned tool or a missing supply (verified by automated validation tests with recorded fixtures), and marking a project made correctly reduces quantities.

### Phase 3 — Smart intake
- Barcode scan, local UPC cache, seed file, vision package/item photo, bulk photo review.
- **Done when:** scanning the same product twice fills the form instantly the second time with no network call, and a bulk photo of 5 items produces an editable 5-row review list.

### Phase 4 — Polish and release
- Additional verified machine profiles; expanded UPC seed; accessibility pass (font size setting, contrast, screen reader labels); final screenshots in the key guide; measured cost numbers in the guide; README; Pages deployment; Docker image.
- **Done when:** a non-technical tester can go from the link to their first suggestion using only the in-app help.

### Phase 5 — Later (not in v1)
- Tauri desktop build / installer.
- Optional sync between devices.
- Optional online UPC provider if a CORS-friendly one exists.

---

## 12. Testing
- Unit: suggestion validation/classification, deduction math, backup round-trip and schema migration, inventory-to-prompt compaction.
- AI calls mocked via `aiClient`; keep recorded response fixtures in `/tests/fixtures/`.
- Playwright smoke: wizard → add item → export/import.
- Manual device checklist: iPad Safari (installed and not installed), iPhone Safari, Android Chrome, desktop Chrome/Edge/Safari.

---

## 13. Open questions
1. Final app name and hosted URL. → **CraftCue, terrylackey243.github.io/craftcue**
2. Which machine profiles beyond the Maker 5 make the first public release. → **Maker 3/4, Explore 3/4/5, Joy/Joy Xtra, Silhouette Cameo 5, Brother ScanNCut DX**
3. Whether to seek a UPC data source that allows browser access. → open; see CONTRIBUTING.md
4. Whether a hosted, no-key paid option is ever worth offering (would require a backend — out of scope for v1).

---

## Implementation decisions (2026-09-28)

- Model IDs use the current aliases: `claude-sonnet-5` (suggestions), `claude-haiku-4-5` (vision), `claude-opus-5` behind "Best" quality. Structured output via `output_config.format` (JSON schema generated from zod), validated again on the client.
- `uses[].amount` is per finished item; sell mode checks amounts × batch size.
- Cutting mats are treated as reusable and never deducted. Rolls convert to length using their listed size ("12 in x 10 ft").
- Added a per-supply `lowAt` threshold (default 1) for the low-stock badge and shopping list.
- HashRouter, so the app works on any static host without rewrite rules.
- Measured cost: 4–7 cents per round of 5 suggestions (Sonnet 5, medium effort), 40–70 s.
