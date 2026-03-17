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

## Specs & Plans
- `docs/superpowers/specs/` — design specs written before implementation (source of truth for "why")
- `docs/superpowers/plans/` — step-by-step implementation plans tied to each spec
- `.superpowers/` — brainstorm session working files (gitignored)

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
      reverb-modal.js     ← Alpine.data('reverbModal') — Reverb sync (orders, link listings, listing details)
```

### Alpine Conventions
- **Store** (`Alpine.store('dw', {...})`) — single source of truth. All records, lots,
  loading state, active view, active modal, and active record ID live here.
- **Views** (`Alpine.data('xyzView', ...)`) — read from `$store.dw.*` only.
  No Airtable calls in view components — ever.
- **Modals** (`Alpine.data('xyzModal', ...)`) — same rule. Modal open/close state
  is managed via `$store.dw.activeModal`, `activeRecordId`, `activeLotName`.
- **No imports** — files are loaded via `<script src>` in order in index.html.
  Load order: config.js → store.js → sidebar.js → views/* → modals/* → Chart.js CDN → charts.js

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

### Items View — Sort Architecture
All columns sortable. Sort state lives in `itemsView` local state (`sortKey`, `sortDir`). Applied at the end of the `rows` getter after filtering. Default: `createdTime DESC`.

- `sortBy(key)` — toggles dir if same key, else sets new key + `'asc'`
- `sortIndicator(key)` — returns `' ↑'`, `' ↓'`, or `''` for use in `<th>` templates
- `<th class="sortable" :class="{'sort-active': sortKey==='x'}" @click="sortBy('x')">`
- Same pattern used in `lotsView` for the Lots table

**Date formatting convention** — compact date columns use `toLocaleDateString('en-US', { month: 'short', day: 'numeric' })` → `"Mar 15"`. Style: `color:var(--muted); white-space:nowrap`. Always placed as the first column.

### Items View — Filter Architecture
Three independent filter axes, all applied in `itemsView.rows` getter:

| Filter | Lives in | Default |
|---|---|---|
| `statusFilter` | `itemsView` local state | `'Listed'` |
| `siteFilter` | `itemsView` local state | `'All'` |
| `categoryFilter` | `$store.dw` | `null` (= no filter) |

**Navigating to Items view with filters** — use `$store.dw.navToItems(status, category, site)`.
This sets `pendingFilters` on the store (a single object so the watcher always fires),
then `itemsView` consumes it on the next tick, setting all three axes at once. Unspecified
args default to `'All'`/`null` so every navigation is a clean slate.

**Rule:** clicking any status or site pill clears `categoryFilter`. Pills represent the
complete filter state — they must never silently combine with a hidden category filter.

**Item modal drill-down** — Status, Category, and Site badges in read view are clickable
and call `navToItems()`. The Lot field calls `openModal('lot', null, lotName)` to switch
to the Lot detail modal directly.

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
  `--muted`, `--surface`, `--border`, `--border2`, `--ebay`, `--reverb`, `--white`
- `--white: #f0f0f0` — primary text/high-contrast color; defined in `main.css :root`
- Color semantics: yellow = estimate/pending, green = actual/positive,
  red = cost/negative, blue = action

### Label Modal — Ship Workflow
- Weight input is lbs + oz (combined as `lbs + oz/16` for Shippo API)
- On open: fetches Reverb order (if `reverbOrderNum` set) to auto-fill shipping address
- On label purchase: auto-fires saveShipping() + markShipped() immediately — do not wait for button click
- saveShipping() writes shipping cost + status=Sold + dateSold + sale price in one Airtable update
- Sale price uses `order.direct_checkout_payout` (post-fee payout) with fallback to `order.amount_product.amount`

### Reverb Sync Modal — Sections
- **Awaiting Shipment** — matches orders to records by `reverbListingId`; saves order numbers; SHIP button opens label modal
- **Link Listings** — links unlinked Listed/Reverb records to their Reverb listing ID via dropdown
- **Listing Details** — computes name/price diffs between fetched listings and Airtable; SYNC applies selected changes
  - Listings fetched with full pagination (follows `_links.next.href`)
  - Diffs computed in `_process()` from already-fetched `this.listings` — zero extra API calls
  - `syncDetails()` calls `dw.fetchAll()` before `_process()` — **important pattern**: any modal write that updates fields visible in views/other modals must call `fetchAll()` first so the store is fresh before re-diffing. `saveMatches()`/`saveLinks()` skip `fetchAll()` because they only update fields the modal itself tracks.

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

## When to Use Superpowers Workflow

Not every ticket needs brainstorm → spec → plan → subagents. Default to just reading the file and making the change.

| Signal | Approach |
|---|---|
| Single file, obvious change | Just do it |
| Known bug, root cause clear | Just do it |
| UI tweak (font, color, layout) | Just do it |
| Clear requirements, 2–3 files | Plan only (skip brainstorm) |
| Ticket already has impl notes | Plan only (skip brainstorm) |
| New data flow or API integration | Full workflow |
| Multiple files with shared state | Full workflow |
| Requirements fuzzy or design unclear | Full workflow |

The brainstorm/spec/plan overhead is ~20–30 min. Worth it when it prevents debugging sessions. Not worth it for targeted single-concern changes.

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

### 2026-03-17 (Shipping modal + Shippo investigation session)
- **#17 enhancement (P1) — DONE:** Added Shipping sidebar button and modal. `GET /api/label/usage` endpoint in `server/shippo.js` — always queries live token, filters `object_test=false` at API level, `status=SUCCESS` on response. Billing cycle uses epoch math from `BILLING_EPOCH = 2026-03-11` (confirmed by Shippo support) + 30-day rolling window. Color-coded usage display (green/yellow/red). Fixed UTC timezone display bug (March 11 was rendering as March 10 in Pacific).
- **#18 bug (P2) — FILED:** Shippo free tier limitations. Test labels count against 30-label quota but don't appear via live PAT (can't count them). Refunded labels eventually drop out. Support unable to offer workaround. Need to evaluate EasyPost or ShipEngine as replacements — requirement is UPS rates comparable to PirateShip.

### 2026-03-17 (CSS polish + Reverb sync per-item session)
- **#16 bug (P1) — DONE:** Centered all table headers and badge/value cells across all list views (Items, Lots, Dashboard tables, Lot modal). Name/item name tds kept left-aligned. Numeric `td.num`/`td.num-col` stay right-aligned. Added `white-space: nowrap` to sortable `th` to prevent sort arrow wrapping onto its own line.
- **No ticket:** Music badge changed from blue to orange (too close to Reverb badge). Gaming badge changed from orange to pink (`#d070b0` on `#2e1a2a`) to compensate.
- **#15 enhancement (P1) — DONE:** Per-item checkboxes on Reverb Sync listing detail diffs. Each row defaults checked; SYNC button shows selected count and disables when nothing is checked. `detailSelections` state initialized in `_process()`, reset in `run()`, filtered in `syncDetails()`.

### 2026-03-17 (Reverb Sync Details session)
- **#14 enhancement (P1) — DONE:** Reverb Sync modal now has a "LISTING DETAILS" section. Fetches all listing pages (paginated via `_links.next.href`). Computes name/price diffs in `_process()` from already-fetched listings (zero extra API calls). SYNC button writes changed fields to Airtable, then `fetchAll()` + `_process()` to clear resolved diffs. Defined `--white: #f0f0f0` in `main.css :root` (was previously used but undefined). Spec + plan in `docs/superpowers/`.
- **#15 enhancement (P1) — OPEN:** Per-item accept/decline for listing detail diffs. Currently bulk-only. Filed with full implementation notes (checkboxes per row, `detailSelections` state, filter in `syncDetails()`).
- **#12 bug (P1) — still awaiting real-order validation**

### 2026-03-17 (Dashboard Charts session)
- **#4 enhancement (P2):** Dashboard analytics charts — added 4-chart analytics section using Chart.js 4 CDN (no build step). New file `public/v2/js/charts.js` registers `Alpine.data('chartsSection')` with dual-path init pattern (`$watch` + immediate check). Charts: (1) Monthly Revenue + Profit (bar+line combo, YYYY-MM sort key), (2) Inventory Pipeline (horizontal stacked bar, Unlisted/Listed/Pending/Sold with EAF/cost annotations), (3) Lot ROI (horizontal bars, color-coded green/yellow/red, recomputed from store not dashView), (4) Near-term Upside by Category (vertical bars, category colors). HTML no-data overlays via `x-show` on each canvas. Charts section positioned above Lot Recovery. Spec + plan in `docs/superpowers/specs/` and `docs/superpowers/plans/`. `.superpowers/` added to `.gitignore`.
- **#12 bug (P1) — OPEN:** Item update/shipping flow still pushing Reverb listing price instead of actual earnings as sale price. To be fixed next session.

### 2026-03-17 (Decimal + cleanup session)
- **#13 enhancement (P1):** Bring back decimals — updated `fmt0()` in `store.js` to use `toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })`. All price displays now show 2 decimal places (e.g. `$150.00`). One-line change, all views/modals updated automatically.
- **#12 bug (P1) — OPEN (fixed, awaiting validation):** Sale price fix already committed (`d2353d3`). Using `direct_checkout_payout.amount` (post-fee) instead of listing price. Left open until confirmed on a real incoming Reverb order.

### 2026-03-17 (P2 Enhancement session)
- **#2 enhancement (P2):** Readability pass — body font 13→15px, table rows 12→14px, table headers 10→11px, badges 11→12px, uppercase labels 10→11px, `--muted` #888→#999. Note: table has its own `font-size` that must be updated separately from body.
- **#5 enhancement (P2):** Sortable column headers on Items and Lots views. `sortBy`/`sortIndicator` pattern; default `createdTime DESC`. Added "Added" date column (first column, muted, `nowrap`) to Items table so `createdTime` sort is always accessible.
- **#7 enhancement (P2):** "Recently Listed" full-width panel on Dashboard, below the lot recovery / recently sold 2-col grid. Same structure as Recently Sold: 10 items, clickable rows open item modal. Also standardized "Sold" date column in Recently Sold to match Added format (`Mon Day`, first column).

### 2026-03-17 (Bug & Enhancement session)
- **#8 bug (P1):** Lot Detail Modal columns — renamed "List / EAF" header to "EAF"; added `white-space:nowrap` to non-name `<th>` elements so Name column gets full remaining width
- **#6 enhancement (P1):** Item modal drill-down — Status, Category, Site badges now clickable; navigate to Items view with that filter applied (others reset to All). Lot field opens Lot detail modal. Added `navToItems(status, category, site)` to store + `pendingFilters` pattern for reliable cross-component filter handoff. Pill clicks clear `categoryFilter` to prevent silent filter stacking. Normalized all "Platform" labels to "Site".

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
