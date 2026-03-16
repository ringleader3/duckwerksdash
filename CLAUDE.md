# Duckwerks Dashboard — Claude Code Guide

> **Source of truth:** This file is the authoritative reference for all sessions.
> Update it at the end of every session with any structural changes made.

## Project Overview
Personal resale inventory dashboard for Geoff Goss (Duckwerks Music). Tracks music gear, comics, and gaming items sold on eBay and Reverb. Built with Alpine.js, served by a local Express server, backed by Airtable.

---

## Stack
- **Frontend:** `public/v2/` — Alpine.js, modular JS files, no build step
- **Backend:** `server.js` — local Express server (Node 22), proxies all API calls
- **Database:** Airtable (REST API via server proxy — PAT never leaves the server)
- **Shipping:** Shippo API (proxied through Express)
- **Config:** `.env` file — never commit, never read client-side

## Running Locally
```bash
npm start   # starts Express on http://localhost:3000
```

## Version Control
- GitHub: https://github.com/ringleader3/duckwerksdash (private)
- Commit after any meaningful session of changes
- Never commit `.env`, `node_modules/`, `*.pdf`, `test.html`, `comic-reselling-project.md`

---

## Key Files
- `public/v2/index.html` — app shell: layout, CDN scripts, view + modal containers
- `public/v2/js/` — all frontend logic (config, store, sidebar, views, modals)
- `public/v2/css/` — main.css (layout/tokens) + components.css (badges, cards, modals)
- `server.js` — Express entry point: mounts routers, serves static files, redirects `/` → `/v2`
- `server/airtable.js` — Airtable proxy routes (`/api/airtable/*`)
- `server/shippo.js` — all Shippo routes (`/api/label/*`, `/api/shippo/*`)
- `server/reverb.js` — all Reverb routes (`/api/reverb/*`)
- `.env` — secrets (Shippo tokens, from-address, Airtable PAT)
- `package.json` / `node_modules/` — Express + dotenv

The old single-file dashboard (`duckwerks-dashboard.html`) remains in the repo as a fallback but is not the active frontend.

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
- `SHIPPO_TEST_MODE=true/false` in `.env` — server-side only, never client-controlled
- Requires server restart to take effect — startup log shows `Shippo: mode=LIVE` or `mode=TEST`
- Use test mode to buy free fake labels for end-to-end testing without spending money
- Test transactions visible at goshippo.com under Test Mode toggle

---

## Server API Endpoints

**server.js** (entry point — thin)
- `GET /` — redirects to `/v2`
- `GET /api/config` — returns `{ airtablePat }` from `.env`
- `/v2` static route → `public/v2/`

**server/airtable.js** (mounted at `/api/airtable`)
- `GET /api/airtable/*` — proxies to `api.airtable.com/v0/*`, injects PAT server-side
- `PATCH /api/airtable/*` — update record
- `POST /api/airtable/*` — create record

**server/shippo.js** (mounted at `/api/label` and `/api/shippo`)
- `POST /api/label/rates` — create Shippo shipment, return sorted rates. Body: `{ toAddress, parcel }` (parcel weight in decimal lbs)
- `POST /api/label/purchase` — purchase a rate, return tracking + label URL. Body: `{ rateObjectId }`
- `POST /api/shippo/:path` — generic Shippo proxy (POST)
- `GET /api/shippo/:path` — generic Shippo proxy (GET)
- Note: `testMode` is read from `.env` server-side — do not send it from client

**server/reverb.js** (mounted at `/api/reverb`)
- `GET /api/reverb/*` — proxies to Reverb API with auth
- `POST /api/reverb/*` — proxies to Reverb API with auth

All credentials injected server-side from `.env` — never exposed to the browser.

**Adding a new API integration:** create `server/yourapi.js`, add `app.use('/api/yourapi', require('./server/yourapi'))` in server.js.

---

## Airtable
- All Airtable calls go through `/api/airtable` proxy — PAT never leaves the server
- `BASE_ID` and `TABLE_ID` in `public/v2/js/config.js`
- Field IDs in the `F` object in `config.js` — always use field IDs, not names

---

## User Preferences
- Geoff is comfortable with Node/Express
- Keep it simple — this is a personal tool, not a product
- No unnecessary abstractions or future-proofing
- Dark theme, monospace font (`Space Mono`), `Bebas Neue` for large numbers
- Yellow = estimate/pending, Green = actual/positive, Red = cost/negative, Blue = action

---

## Dashboard (Alpine.js)

### File Structure
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

### Alpine Conventions
- **Store** (`Alpine.store('dw', {...})`) — single source of truth. All records, lots,
  loading state, active view, active modal, and active record ID live here.
- **Views** (`Alpine.data('xyzView', ...)`) — read from `$store.dw.*` only.
  No Airtable calls in view components — ever.
- **Modals** (`Alpine.data('xyzModal', ...)`) — same rule. Modal open/close state
  is managed via `$store.dw.activeModal`, `activeRecordId`, `activeLotName`.
- **No imports** — files are loaded via `<script src>` in order in index.html.
  Load order: config.js → store.js → sidebar.js → views/* → modals/*

### Data Layer
- `F{}` field map in `config.js` — single source of truth for Airtable field IDs
- `$store.dw.records[]` — all Airtable inventory records, fetched on init
- `$store.dw.lots[]` — all Airtable lot records, fetched on init
- `$store.dw.fetchAll()` — only place Airtable is called. Re-call after any write.

### Key Computed Values (do not change formula)
```js
// Earnings after fees (Reverb: 5% selling + 3.19% processing + $0.49 flat)
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

### Views
| View | Default filters | Entry point |
|---|---|---|
| Dashboard | — | KPIs, lot recovery table, recently sold |
| Items | Status: Listed, Site: All | Daily driver — inline status edit, EAF payout column |
| Lots | All lots | Click row → Lot Detail modal |

### Sidebar
- **ADD ITEM** button → opens Add modal
- **Quick Find** — live search against `$store.dw.records` in memory (no Airtable calls)
  - Results: Items (→ Item modal), Lots (→ Lot modal), Categories (→ Items view filtered)
  - Sold items shown dimmed, not hidden
  - Keyboard shortcuts: `/` or `cmd+k` focuses search input; ↑/↓ navigates results; Enter selects
- **Nav pills** — Dashboard / Items / Lots
- **Actions** — Sync Reverb

### Design System
- Dark theme, `Space Mono` body, `Bebas Neue` large numbers
- CSS vars: `--green`, `--yellow`, `--red`, `--blue`, `--purple`, `--orange`,
  `--muted`, `--surface`, `--border`, `--border2`, `--ebay`, `--reverb`
- Color semantics: yellow = estimate/pending, green = actual/positive,
  red = cost/negative, blue = action

### Label Modal — Ship Workflow
- Weight input is lbs + oz (combined as `lbs + oz/16` for Shippo API)
- On open: fetches Reverb order (if `reverbOrderNum` set) to auto-fill shipping address
- On label purchase: auto-fires saveShipping() + markShipped() immediately — do not wait for button click
- saveShipping() writes shipping cost + status=Sold + dateSold + sale price in one Airtable update
- Sale price uses `order.direct_checkout_payout` (post-fee payout) with fallback to `order.amount_product.amount`

### Reverb API `_links` Structure
- `_links.ship.href` — direct href, POST to mark order shipped
- `_links.packing_slip.web.href` — public reverb.com URL, open directly (no proxy needed)
- `order.direct_checkout_payout` — post-fee seller payout (what to store as F.sale); `order.amount_product.amount` is pre-fee listing price
- `order.shipping_address` — buyer address

### Working on Files
JS files are small and targeted — read them in full if under ~150 lines.
For `index.html`, always grep first then targeted reads only.
Never read `public/v2/index.html` in full — it exceeds 300 lines.

```
Grep → find line numbers
Read offset+limit → read only that section
Edit → surgical str_replace
```

---

## Session Start Checklist
1. Read `CLAUDE.md` (this file) — especially Session Log
2. Run `gh issue list --state open` to see current bugs and enhancements
3. Grep before any file read. One edit per logical change. Commit when done.
4. Update Session Log and close/reference any resolved GitHub issues at end of session.

---

## Debugging Alpine Issues
- **Always ask for browser console output** when something doesn't work as expected.
  Console errors (especially Alpine expression errors) give the exact expression and
  element that failed — far faster than guessing from code review alone.
- Alpine expression errors crash reactivity for that binding, which can cause cascading
  symptoms (e.g. new records not appearing) that look unrelated to the real error.
- Common Alpine pitfalls:
  - `x-if="!someGetter"` renders when the getter returns false for null state — always
    guard: `x-if="record && !someGetter"`
  - Direct property access in templates (e.g. `record.fields[x]`) will throw if the
    object is null; use `record?.fields?.[x]` or add an `x-show="record"` outer guard
  - `x-show` hides elements but Alpine still evaluates all bound expressions inside —
    only `x-if` prevents evaluation
- `Alpine.effect(() => { ... })` works inside `Alpine.store` init() for reactive side effects (e.g. localStorage persistence)
- `x-for="(item, i) in list"` — use this syntax when you need the loop index in template expressions
- For hard-to-reproduce bugs, add temporary `console.log` inside store methods or
  Alpine `init()` hooks, then ask Geoff to trigger the action and share the output.

---

## Bug & Enhancement Tracking
GitHub Issues on `ringleader3/duckwerksdash`. Run `gh issue list --state open` at session start to see open items.
- `gh` CLI: `brew install gh` + `gh auth login` (choose HTTPS — repo remote is HTTPS)
- **Issue types:** `bug` or `enhancement` label
- **Priorities:** `P1` (do first) or `P2` (do after P1s) label
- Work P1 bugs first, then P1 enhancements, then P2s
- **Reference issues in commits** using `ref #N` (e.g. `ref #3: improve sidebar logo`) but **do not close issues** — only Geoff closes issues after confirming the fix looks right in the browser
- Never use `fix #N` or `closes #N` in commit messages as GitHub auto-closes on push

---

## Session Log
_Most recent first. Update this at the end of every session._

### 2026-03-16 (Bug & Enhancement session)
- **#1 bug (P1):** Search results scrollable dropdown — added `scrollIntoView` on active row during keyboard nav
- **#3 enhancement (P1):** Sidebar logo — replaced base64 JPEG with actual file (`public/v2/duckwerksheader.jpeg`); full-bleed banner with zoom/crop to foreground, DUCKWERKS title below

### 2026-03-16 (Phase 8)
- Added `cmd+k` shortcut to focus search (alongside `/`)
- Added localStorage persistence for `activeView` via `Alpine.effect()` in store init
- Added "needs attention" flag (⚑ orange) on Items view for Listed items ≥ 20 days (uses `createdTime`)
- Added keyboard navigation (↑/↓/Enter) to Quick Find search results
- Cutover: `GET /` now redirects to `/v2`; old dashboard accessible at `/duckwerks-dashboard.html`
- Switched to GitHub Issues for bug/enhancement tracking (`gh` CLI, HTTPS auth)
- Cleaned up CLAUDE.md: removed all porting/build-phase framing; deleted `duckwerks-v2-buildplan.md` and `duckwerks_dashboard_architecture.md`

### 2026-03-16 (Phase 7)
- Implemented Label modal (`label-modal.js`) — lbs+oz weight, 3-step flow (form→rates→result), auto-fills address from Reverb order, auto mark-shipped on Reverb after purchase
- SAVE SHIPPING COST closes out sale: sets status=Sold, dateSold, sale price (from Reverb order), shipping in one write
- Implemented Reverb Sync modal (`reverb-modal.js`) — awaiting shipment matching + link listings; SHIP button directly on matched orders
- Moved `SHIPPO_TEST_MODE` server-side to `.env`; server logs active mode on startup
- Fixed packing slip: `_links.packing_slip.web.href` is a plain reverb.com URL — open directly, no proxy
- **Post-phase bug fixes:** auto-save on purchase; switched sale amount to `direct_checkout_payout` (post-fee); SAVE button shows ✓ SAVED state

### 2026-03-16 (Phase 6)
- Implemented Dashboard view — 5 stat cards (Total Invested, Revenue, Profit, Upside Pending, Inventory) + Lot Recovery table + Recently Sold table
- Added `F.dateSold` field (`fldcIJOUtePuaxAVH`) to `config.js`
- Auto-populate dateSold when status set to Sold (items.js inline + item-modal.js save)
- Added `scripts/backfill-sold-dates.js` and `scripts/match-reverb-orders.js` — one-time data migration scripts

### 2026-03-16 (Phase 5)
- Implemented Lots view and Lot modal
- Fixed Add modal Lot dropdown always disabled — Alpine treats `''` as truthy for boolean attributes
- Added "+ ADD ANOTHER" button to Add modal

### 2026-03-15 (Phase 4)
- Implemented Item modal (read + edit views) and Add modal
- Added `createRecord()` to store; modal CSS to components.css; `[x-cloak]` rule

### 2026-03-15 (Phase 3)
- Implemented Items view — status/site/name filters, full table, inline status edit
- Added `updateRecord()` to store

### 2026-03-15 (Phase 2)
- Implemented Quick Find search in sidebar — items, lots, categories; keyboard shortcut `/`

### 2026-03-15 (Phase 1)
- Split `server.js` into modules; added `server/airtable.js` proxy
- Scaffolded full `public/v2/` file structure; Alpine store wired up
