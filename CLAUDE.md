# Duckwerks Dashboard — Claude Code Guide

> **Source of truth:** This file (`CLAUDE.md`) is the authoritative architecture reference for all sessions.
> `duckwerks_dashboard_architecture.md` covers v1 only and will be deprecated after v2 cutover.
> Update this file at the end of every session with any structural changes made.

## Project Overview
Personal resale inventory dashboard for Geoff Goss (Duckwerks Music). Tracks music gear, comics, and gaming items sold on eBay and Reverb. A v2 rewrite (Alpine.js, modular file structure) is in progress at `/v2`. The original v1 (`duckwerks-dashboard.html`) remains live and untouched until v2 cutover.

---

## Stack
- **Frontend:** `duckwerks-dashboard.html` — single-file vanilla JS/HTML/CSS app (~2000 lines)
- **Backend:** `server.js` — local Express server (Node 22), serves the HTML and proxies Shippo API calls
- **Database:** Airtable (REST API, called directly from the browser)
- **Shipping:** Shippo API (proxied through Express — cannot be called from browser directly)
- **Config:** `.env` file — never commit, never read client-side

## Running Locally
```bash
npm start   # starts Express on http://localhost:3000
```
Open: `http://localhost:3000/duckwerks-dashboard.html`

## Version Control
- GitHub: https://github.com/ringleader3/duckwerksdash (private)
- Commit after any meaningful session of changes
- Never commit `.env`, `node_modules/`, `*.pdf`, `test.html`, `comic-reselling-project.md`

---

## Key Files
- `duckwerks-dashboard.html` — the entire frontend
- `server.js` — Express entry point: mounts routers, serves static files
- `server/airtable.js` — Airtable proxy routes (`/api/airtable/*`) — used by v2
- `server/shippo.js` — all Shippo routes (`/api/label/*`, `/api/shippo/*`)
- `server/reverb.js` — all Reverb routes (`/api/reverb/*`)
- `.env` — secrets (Shippo tokens, from-address)
- `duckwerks_dashboard_architecture.md` — detailed frontend architecture reference
- `package.json` / `node_modules/` — Express + dotenv

---

## Working on the HTML File

**The HTML file is ~2000 lines. Never read it in full.**

Always use Grep to find line numbers first, then Read only the relevant section (±30 lines). Make surgical edits with Edit. Never regenerate the whole file.

```
Grep → find line numbers
Read offset+limit → read only that section
Edit → surgical str_replace
```

Bump `VERSION` in the HTML config section on any structural change.
Update `duckwerks_dashboard_architecture.md` if any function, state var, view, CSS class, or data field is added/removed/renamed.

---

## Environment Variables (.env)
```
SHIPPO_TEST_TOKEN=shippo_test_...
SHIPPO_LIVE_TOKEN=shippo_live_...
AIRTABLE_PAT=pat...
FROM_NAME=Geoff Goss, Duckwerks Music
FROM_STREET1=...
FROM_CITY=San Francisco
FROM_STATE=CA
FROM_ZIP=...
FROM_COUNTRY=US
FROM_PHONE=...
```

## Shippo Test vs Live
- `SHIPPO_TEST_MODE = true/false` constant at top of HTML script block
- Currently set to `false` (live mode)
- Test transactions visible at goshippo.com under Test Mode toggle

---

## Server API Endpoints

**server.js** (entry point — thin)
- `GET /api/config` — returns `{ airtablePat }` from `.env`; used by v1 frontend only
- `/v2` static route → `public/v2/`
- Static file serving for project root at `/`

**server/airtable.js** (mounted at `/api/airtable`) — v2 uses this; v1 calls Airtable directly
- `GET /api/airtable/*` — proxies to `api.airtable.com/v0/*`, injects PAT server-side
- `PATCH /api/airtable/*` — update record
- `POST /api/airtable/*` — create record

**server/shippo.js** (mounted at `/api/label` and `/api/shippo`)
- `POST /api/label/rates` — create Shippo shipment, return sorted rates. Body: `{ testMode, toAddress, parcel }`
- `POST /api/label/purchase` — purchase a rate, return tracking + label URL. Body: `{ testMode, rateObjectId }`
- `POST /api/shippo/:path` — generic Shippo proxy (POST). Body: `{ testMode, ...shippoPayload }`
- `GET /api/shippo/:path` — generic Shippo proxy (GET). Query: `?testMode=true`

**server/reverb.js** (mounted at `/api/reverb`)
- `GET /api/reverb/*` — proxies to Reverb API with auth
- `POST /api/reverb/*` — proxies to Reverb API with auth

All credentials injected server-side from `.env` — never exposed to the browser.

**Adding a new API integration:** create `server/yourapi.js`, add `app.use('/api/yourapi', require('./server/yourapi'))` in server.js.

---

## Airtable
- **v1:** called directly from browser; PAT fetched via `/api/config` on load (CORS allowed by Airtable)
- **v2:** all Airtable calls go through `/api/airtable` proxy — PAT never leaves the server
- `BASE_ID` and `TABLE_ID` in `public/v2/js/config.js` (v2) and HTML `<script>` block (v1)
- Field IDs in the `F` object — always use field IDs, not names

---

## User Preferences
- Geoff is comfortable with Node/Express
- Keep it simple — this is a personal tool, not a product
- No unnecessary abstractions or future-proofing
- Dark theme, monospace font (`Space Mono`), `Bebas Neue` for large numbers
- Yellow = estimate/pending, Green = actual/positive, Red = cost/negative, Blue = action
---

## V2 Dashboard (Alpine.js Rewrite)

A parallel rewrite served at `localhost:3000/v2`. The original `duckwerks-dashboard.html`
remains live and untouched at `/`. Do not modify it during v2 work.

### V2 File Structure
```
public/v2/
  index.html              ← shell: layout, CDN scripts, view + modal containers
  css/
    main.css              ← design tokens, sidebar, layout grid
    components.css        ← badges, pills, stat cards, tables, modal overlays
  js/
    config.js             ← F{} field map, BASE_ID, TABLE_ID, constants
    store.js              ← Alpine.store('dw') — all data, helpers, modal state
    sidebar.js            ← Alpine.data('sidebar') — search + nav state
    views/
      dashboard.js        ← Alpine.data('dashView')
      items.js            ← Alpine.data('itemsView')
      lots.js             ← Alpine.data('lotsView')
    modals/
      item-modal.js       ← Alpine.data('itemModal')
      add-modal.js        ← Alpine.data('addModal')
      lot-modal.js        ← Alpine.data('lotModal')
      label-modal.js      ← Alpine.data('labelModal') — Shippo flow
      reverb-modal.js     ← Alpine.data('reverbModal') — Reverb sync
```

### Server
One line added to `server.js`:
```js
app.use('/v2', express.static(path.join(__dirname, 'public/v2')));
```
No other server changes. All existing `/api/*` routes work as-is.

### Alpine Conventions
- **Store** (`Alpine.store('dw', {...})`) — single source of truth. All records, lots,
  loading state, active view, active modal, and active record ID live here.
- **Views** (`Alpine.data('xyzView', ...)`) — read from `$store.dw.*` only.
  No Airtable calls in view components — ever.
- **Modals** (`Alpine.data('xyzModal', ...)`) — same rule. Modal open/close state
  is managed via `$store.dw.activeModal`, `activeRecordId`, `activeLotName`.
- **No imports** — files are loaded via `<script src>` in order in index.html.
  Load order: config.js → store.js → sidebar.js → views/* → modals/*

### V2 Data Layer
- `F{}` field map in `config.js` — same field IDs as v1, single source of truth
- `$store.dw.records[]` — all Airtable inventory records, fetched on init
- `$store.dw.lots[]` — all Airtable lot records, fetched on init
- `$store.dw.fetchAll()` — only place Airtable is called. Re-call after any write.
- Airtable PAT fetched from `/api/config` on init, same as v1

### Key Computed Values (same as v1 — do not change formula)
```js
// Earnings after fees — apply to listPrice only, never to F.sale
eaf(p) { return p > 0 ? Math.max(0, p * 0.9181 - 0.49) : 0; }

// Estimated profit for listed items
// shipEst: use actual shipping if set, else $10 placeholder (show in yellow)
estProfit(r) {
  const lp   = this.num(r, F.listPrice);
  const cost = this.num(r, F.cost);
  const ship = r.fields[F.shipping] != null ? this.num(r, F.shipping) : 10;
  return this.eaf(lp) - cost - ship;
}
```

### V2 Views
| View | Default filters | Entry point |
|---|---|---|
| Dashboard | — | KPIs, lot recovery table, recently sold |
| Items | Status: Listed, Site: All | Daily driver — inline status edit, EAF payout column |
| Lots | All lots | Click row → Lot Detail modal |

### V2 Sidebar
- **ADD ITEM** button → opens Add modal
- **Quick Find** — live search against `$store.dw.records` in memory (no Airtable calls)
  - Results: Items (→ Item modal), Lots (→ Lot modal), Categories (→ Items view filtered)
  - Sold items shown dimmed, not hidden
  - Keyboard shortcut: `/` focuses search input
- **Nav pills** — Dashboard / Items / Lots
- **Actions** — Sync Reverb

### V2 Design System
Same as v1 — do not redesign:
- Dark theme, `Space Mono` body, `Bebas Neue` large numbers
- CSS vars: `--green`, `--yellow`, `--red`, `--blue`, `--purple`, `--orange`,
  `--muted`, `--surface`, `--border`, `--border2`, `--ebay`, `--reverb`
- Color semantics: yellow = estimate/pending, green = actual/positive,
  red = cost/negative, blue = action

### Working on V2 Files
V2 JS files are small and targeted — you can read them in full if under ~150 lines.
For `index.html`, use grep + targeted reads (same rules as v1 HTML file).
Never read `public/v2/index.html` in full once it exceeds ~300 lines.

### Build Phases
See `duckwerks-v2-buildplan.md` for the full 8-phase plan with checkpoints.
Always confirm phase checkpoint with Geoff before starting the next phase.
Commit at every checkpoint.

### Session Start Checklist (V2 work)
1. Read `CLAUDE.md` (this file) — especially V2 section and Session Log
2. Reference `duckwerks_dashboard_architecture.md` only when porting v1 logic
3. Ask Geoff: which phase, what was the last checkpoint completed?
4. Grep before any file read. One edit per logical change. Commit when done.
5. Update Session Log below before ending the session.

---

## Session Log
_Most recent first. Update this at the end of every session._

### 2026-03-15 (Phase 3)
- Implemented Items view (`items.js`) — status/site/name filters, full table
- Added Site and Status columns; inline status dropdown (no modal needed)
- EAF payout + est. profit shown in yellow; shipping yellow if estimated
- Added `updateRecord()` to store for inline status edits
- Fixed listed badge color (solid blue) to distinguish from Music category badge
- Added Site column (eBay/Reverb badge)
- **Next:** Phase 4 — Item modal + Add modal

### 2026-03-15 (Phase 2)
- Implemented Quick Find search in sidebar (`sidebar.js`) — items, lots, categories
- Added `categoryFilter` state to store; nav pills reset it on click
- Keyboard shortcut `/` focuses search input
- Search results: items open item modal, lots open lot modal, categories filter items view
- Sold items shown dimmed in results; lots show % cost recovered badge
- **Next:** Phase 3 — Items view

### 2026-03-15 (Phase 1)
- Introduced CLI-based Claude Code workflow (tmux for session persistence)
- Split `server.js` into modules: `server/shippo.js`, `server/reverb.js`
- Added `server/airtable.js` proxy — PAT now never exposed to browser
- Scaffolded full v2 file structure (`public/v2/`) — Phase 1 complete
- Alpine store wired up, `fetchAll()` confirmed loading 91 records via proxy
- `CLAUDE.md` established as primary architecture source of truth
