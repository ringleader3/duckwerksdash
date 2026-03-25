# Duckwerks Dashboard — Claude Code Guide

> **Source of truth:** This file is the authoritative reference for all sessions.
> Update it at the end of every session with any structural changes made.

## Project Overview
Personal resale inventory dashboard for Geoff Goss (Duckwerks Music). Tracks music gear, comics, and gaming items sold on eBay and Reverb. Built with Alpine.js, served by a local Express server, backed by SQLite.

---

## Stack
- **Frontend:** `public/v2/` — Alpine.js, modular JS files, no build step
- **Backend:** `server.js` — local Express server (Node 22), proxies all API calls
- **Database:** SQLite via `better-sqlite3` — `data/duckwerks.db`. All reads/writes through Express routes in `server/`
- **Shipping:** EasyPost API (active provider); Shippo retained but inactive. Provider set via `SHIPPING_PROVIDER` in `.env`
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
- Never commit `.env`, `node_modules/`, `*.pdf`, `test.html`, `comic-reselling-project.md`, `data/duckwerks.db`

---

## Key Files
- `public/v2/index.html` — app shell: layout, CDN scripts, view + modal containers
- `public/v2/js/` — all frontend logic (config, store, sidebar, views, modals)
- `public/v2/css/` — main.css (layout/tokens) + components.css (badges, cards, modals)
- `server.js` — Express entry point: mounts routers, serves static files, redirects `/` → `/v2`
- `server/db.js` — opens `data/duckwerks.db` via better-sqlite3; shared across all routers
- `server/catalog.js` — `/api/sites`, `/api/categories`
- `server/items.js` — `/api/items` (GET all, POST create, PATCH update) — returns items with nested listings/order/shipment
- `server/lots.js` — `/api/lots` (GET all with items, POST create)
- `server/listings.js` — `/api/listings` (POST create, PATCH update)
- `server/orders.js` — `/api/orders` (POST create, PATCH update)
- `server/shipments.js` — `/api/shipments` (POST create, PATCH update)
- `server/label.js` — provider-agnostic label routes (`/api/label/*`) — delegates to Shippo or EasyPost based on `SHIPPING_PROVIDER`
- `server/shippo.js` — Shippo generic proxy (`/api/shippo/*`); also contains Shippo implementation (kept for potential re-use)
- `server/reverb.js` — all Reverb routes (`/api/reverb/*`)
- `server/ebay-auth.js` — eBay OAuth token management (one-time setup + auto-refresh)
- `server/ebay.js` — eBay Sell Fulfillment routes (`/api/ebay/*`) — orders, tracking push, OAuth flow
- `data/ebay-tokens.json` — eBay OAuth tokens (never commit — gitignored)
- `data/duckwerks.db` — SQLite database (never commit)
- `.env` — secrets (EasyPost + Shippo tokens, from-address)
- `package.json` / `node_modules/` — Express + dotenv

The old single-file dashboard (`duckwerks-dashboard.html`) remains in the repo as a fallback but is not the active frontend.

---

## Environment Variables (.env)
```
SHIPPING_PROVIDER=EASYPOST         # EASYPOST or SHIPPO
EASYPOST_TEST_MODE=false
EASYPOST_TEST_TOKEN=EZTK...
EASYPOST_LIVE_TOKEN=EZAK...
SHIPPO_TEST_MODE=false             # retained but inactive
SHIPPO_TEST_TOKEN=shippo_test_...
SHIPPO_LIVE_TOKEN=shippo_live_...
EBAY_CLIENT_ID=GeoffGos-duckwerk-PRD-...
EBAY_CLIENT_SECRET=PRD-...
EBAY_RUNAME=Geoff_Goss-GeoffGos-duckwe-qevlykrb
FROM_NAME=Geoff Goss, Duckwerks Music
FROM_STREET1=...
FROM_CITY=San Francisco
FROM_STATE=CA
FROM_ZIP=...
FROM_COUNTRY=US
FROM_PHONE=...
```

## Shipping Provider Test vs Live
- `SHIPPING_PROVIDER=EASYPOST` or `SHIPPO` in `.env` — requires server restart
- `EASYPOST_TEST_MODE=true/false` — test mode uses separate test API key; test labels don't count against quota (3000/month on live)
- `SHIPPO_TEST_MODE=true/false` — retained but Shippo is inactive; test labels counted against the 30/month quota (Shippo limitation)
- Startup log shows active provider + mode, e.g. `Shipping provider: EASYPOST` / `EasyPost: mode=LIVE`

---

## Server API Endpoints

**server.js** (entry point — thin)
- `GET /` — redirects to `/v2`
- `/v2` static route → `public/v2/`

**server/catalog.js** (mounted at `/api`)
- `GET /api/sites` — all sites
- `GET /api/categories` — all categories

**server/items.js** (mounted at `/api/items`)
- `GET /api/items` — all items with nested listings, order, shipment, category, lot
- `POST /api/items` — create item. Body: `{ name, category_id, lot_id, cost, notes }`
- `PATCH /api/items/:id` — update item fields (`name`, `status`, `category_id`, `lot_id`, `cost`, `notes`)

**server/lots.js** (mounted at `/api/lots`)
- `GET /api/lots` — all lots with nested items
- `POST /api/lots` — create lot. Body: `{ name }`

**server/listings.js** (mounted at `/api/listings`)
- `POST /api/listings` — create listing; auto-sets item status=Listed. Body: `{ item_id, site_id, list_price, shipping_estimate, url, platform_listing_id }`
- `PATCH /api/listings/:id` — update listing fields (`site_id`, `platform_listing_id`, `list_price`, `shipping_estimate`, `url`, `status`, `ended_at`)

**server/orders.js** (mounted at `/api/orders`)
- `POST /api/orders` — create order; auto-sets item status=Sold
- `PATCH /api/orders/:id` — update order fields

**server/shipments.js** (mounted at `/api/shipments`)
- `POST /api/shipments` — create shipment record
- `PATCH /api/shipments/:id` — update shipment fields (tracking_id, tracking_number, tracker_url, shipping_cost, label_url)

**server/label.js** (mounted at `/api/label`)
- `POST /api/label/rates` — create shipment, return sorted rates. Body: `{ toAddress, parcel }` (parcel weight in decimal lbs). Active provider set by `SHIPPING_PROVIDER` in `.env`
- `POST /api/label/purchase` — purchase a rate, return tracking + label URL. Body: `{ rateObjectId }`. EasyPost encodes `shipmentId|rateId` in `rateObjectId` — transparent to client
- `GET /api/label/tracker/:id` — proxies EasyPost tracker by ID; returns tracker object with status, carrier, tracking_details, etc.
- `GET /api/label/usage` — Shippo-only usage counter; returns `{ skipped: true }` when on EasyPost

**server/shippo.js** (mounted at `/api/shippo` — generic proxy only)
- `POST /api/shippo/:path` — generic Shippo proxy (POST)
- `GET /api/shippo/:path` — generic Shippo proxy (GET)
- Note: `testMode` is read from `.env` server-side — do not send it from client

**server/reverb.js** (mounted at `/api/reverb`)
- `GET /api/reverb/*` — proxies to Reverb API with auth
- `POST /api/reverb/*` — proxies to Reverb API with auth

**server/ebay.js** (mounted at `/api/ebay`)
- `GET /api/ebay/auth` — redirects to eBay OAuth consent page (one-time setup)
- `POST /api/ebay/auth/exchange` — exchanges auth code for tokens; called after duckwerks.com/ebay-oauth-callback.php displays the code
- `GET /api/ebay/orders` — orders awaiting fulfillment (`NOT_STARTED|IN_PROGRESS`)
- `GET /api/ebay/orders/:id` — single order (buyer address + `pricingSummary.totalDueSeller` payout)
- `POST /api/ebay/orders/:id/tracking` — push tracking; marks order shipped, triggers payout flow

**eBay OAuth notes:**
- Tokens stored in `data/ebay-tokens.json` (gitignored). Access token auto-refreshes every 2hr; refresh token lasts 18 months.
- Re-auth: visit `/api/ebay/auth`, complete eBay sign-in, land on `duckwerks.com/ebay-oauth-callback.php`, copy code, run the displayed curl command.
- eBay carrier codes: `USPS`, `UPS`, `FEDEX`, `DHL` (mapped from EasyPost names in `server/ebay.js`)
- `totalDueSeller` = post-fee seller payout (equivalent to Reverb's `direct_checkout_payout`)

All credentials injected server-side from `.env` — never exposed to the browser.

**Adding a new API integration:** create `server/yourapi.js`, add `app.use('/api/yourapi', require('./server/yourapi'))` in server.js.

---

## SQLite Schema
- `items` — core inventory: name, status, cost, category_id, lot_id
- `listings` — platform listings per item: site_id, list_price, shipping_estimate, url, platform_listing_id
- `orders` — sale data: listing_id, sale_price, profit, date_sold, platform_order_num
- `shipments` — shipping data: item_id, tracking_id, tracking_number, label_url, shipping_cost
- `sites` — platform lookup: name, fee_rate, fee_flat, fee_on_shipping
- `categories` — category lookup: name, color, badge_class
- `lots` — lot groupings: name

DB location: `data/duckwerks.db`. Re-run migration: `node scripts/migrate-airtable-to-sqlite.js` (requires old Airtable server on :3000 first).

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
    config.js             ← constants (CAT_BADGE, CAT_COLOR, SITE_FEES)
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
      ebay-modal.js       ← Alpine.data('ebayModal') — eBay sync (orders awaiting shipment, link listings)
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
// Platform fee lookup — returns the fee amount given (listPrice, shipping)
// eBay: 13.25% on total (item+ship) + $0.40 flat (consumer electronics rate — update after first AV sale)
// Facebook: no fees (in-person cash sales)
SITE_FEES: {
  'Reverb':   (p)    => p * 0.0819 + 0.49,
  'eBay':     (p, s) => (p + s) * 0.1325 + 0.40,
  'Facebook': ()     => 0,
}

// Estimated profit for listed items — site-aware via SITE_FEES lookup
// ship: use actual if set (incl. est. shipping from add modal), else $10 placeholder (shown yellow)
// Unknown sites fall back to no fees
estProfit(r) {
  const site  = this.siteLabel(r);
  const lp    = this.num(r, F.listPrice);
  const cost  = this.num(r, F.cost);
  const ship  = r.fields[F.shipping] != null ? this.num(r, F.shipping) : 10;
  const feeFn = this.SITE_FEES[site] || (() => 0);
  return lp - cost - ship - feeFn(lp, ship);
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
- saveShipping() writes shipping cost + status=Sold + dateSold + sale price + tracking fields, then calls `fetchAll()` so dashboard tracking panels update immediately
- Sale price uses `order.direct_checkout_payout` (post-fee payout) with fallback to `order.amount_product.amount`
- `date_sold` uses `platformSaleDate` (pulled from Reverb `created_at` / eBay `creationDate`) with fallback to today — ensures correct date when there's a lag between sale and shipping
- `activeReverbOrderNum` — store field set by Reverb modal SHIP button before opening label modal; used when no local order exists yet (same pattern as `activeEbayOrderId` for eBay). Cleared on read in `_open()`.
- Carrier/service name maps live in `server/label.js` (`CARRIER_NAMES`, `SERVICE_NAMES`) — add entries there when new raw codes appear

### Shipping Modal — In Transit
- Shows sold+tracked items that are not yet delivered, or delivered within last 3 days
- Filter logic is `store.isInTransit(r, trackingData)` — update the window there, not in each view
- `deliveredAt` extracted from EasyPost `tracking_details` event with `status === 'delivered'`
- EasyPost test mode uses historical fake delivery dates — items may disappear immediately after delivery in test; this is expected, not a bug

### Modal Back-Navigation
- `store.previousModal` — stashes `{ type, recordId, lotName }` before opening a child modal
- `closeModal()` restores previous modal if set, then clears it
- Currently used by lot modal's `openItem()` so Close returns to the lot
- `navToItems()` clears `previousModal` before closing to prevent unintended restores
- Lot modal escape handler guarded with `activeModal === 'lot'` check to prevent double-fire from window-level listeners

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
- **Issue types:** `bug`, `enhancement`, or `test` label
- **Priorities:** `P1` (do first) or `P2` (do after P1s) label
- Work P1 bugs first, then P1 enhancements, then P2s
- **Reference issues in commits** using `ref #N` (e.g. `ref #3: improve sidebar logo`) but **do not close issues unilaterally** — only close when Geoff explicitly asks
- Never use `fix #N` or `closes #N` in commit messages as GitHub auto-closes on push
- **Test ticket workflow:** For larger features that need live/manual validation (e.g. requires a real order or label purchase), close the implementation ticket when Geoff confirms it's done and open a follow-up `test` ticket with an explicit validation checklist. Keeps impl tickets clean and gives testing a clear home.

---

## Session Log
Full log: [`docs/session-log.md`](docs/session-log.md) — update at end of every session.

