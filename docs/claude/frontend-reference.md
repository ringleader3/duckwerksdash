# Frontend Reference — Duckwerks Dashboard

> Load this file when working on Alpine views, modals, CSS, or frontend architecture.

---

## Alpine Architecture

### Core Conventions
- **Store** (`Alpine.store('dw', {...})`) — single source of truth. All records, lots, loading state, active view, active modal, and active record ID live here.
- **Views** (`Alpine.data('xyzView', ...)`) — read from `$store.dw.*` only. No direct API calls in view components.
- **Modals** (`Alpine.data('xyzModal', ...)`) — same rule. Modal open/close state managed via `$store.dw.activeModal`, `activeRecordId`, `activeLotName`.
- **No imports** — files loaded via `<script src>` in order in index.html.
  Load order: config.js → store.js → sidebar.js → views/* → modals/* → Chart.js CDN → charts.js

### File Structure
```
public/v2/
  index.html              ← shell: layout, CDN scripts, view + modal containers
  css/
    main.css              ← design tokens, sidebar, layout grid
    components.css        ← badges, pills, stat cards, tables, modal overlays
  js/
    config.js             ← constants (CAT_BADGE, CAT_COLOR, SITE_FEES, APP_VERSION)
    store.js              ← Alpine.store('dw') — all data, helpers, modal state
    sidebar.js            ← Alpine.data('sidebar') — search + nav state
    views/
      dashboard.js        ← Alpine.data('dashView')
      items.js            ← Alpine.data('itemsView')
      lots.js             ← Alpine.data('lotsView')
      analytics.js        ← Alpine.data('analyticsView')
      comps.js            ← Alpine.data('compsView') — comp research UI
      catalog.js          ← Alpine.data('catalogView') — disc catalog intake form
    modals/
      item-modal.js       ← Alpine.data('itemModal')
      add-modal.js        ← Alpine.data('addModal')
      lot-modal.js        ← Alpine.data('lotModal')
      label-modal.js      ← Alpine.data('labelModal') — shipping label flow
      reverb-modal.js     ← Alpine.data('reverbModal') — Reverb sync (orders, link listings, listing details)
      ebay-modal.js       ← Alpine.data('ebayModal') — eBay sync (orders awaiting shipment, link listings)
```

### Data Layer
- `$store.dw.records[]` — all inventory items, fetched on init
- `$store.dw.lots[]` — all lot records, fetched on init
- `$store.dw.fetchAll()` — re-call after any write that affects displayed data
- Field constants in `config.js` — source of truth for column/field names

---

## Key Computed Values (do not change formula)

```js
// Platform fee lookup — returns fee amount given (listPrice, shipping)
// eBay: 13.25% on total (item+ship) + $0.40 flat
// Facebook: no fees (in-person cash sales)
SITE_FEES: {
  'Reverb':   (p)    => p * 0.0819 + 0.49,
  'eBay':     (p, s) => (p + s) * 0.1325 + 0.40,
  'Facebook': ()     => 0,
}

// Estimated profit — site-aware via SITE_FEES
// ship: use actual if set, else $10 placeholder (shown yellow)
estProfit(r) {
  const site  = this.siteLabel(r);
  const lp    = this.num(r, F.listPrice);
  const cost  = this.num(r, F.cost);
  const ship  = r.fields[F.shipping] != null ? this.num(r, F.shipping) : 10;
  const feeFn = this.SITE_FEES[site] || (() => 0);
  return lp - cost - ship - feeFn(lp, ship);
}
```

---

## Design System

- Dark theme, `Space Mono` body, `Bebas Neue` large numbers
- CSS vars: `--green`, `--yellow`, `--red`, `--blue`, `--purple`, `--orange`, `--muted`, `--surface`, `--border`, `--border2`, `--ebay`, `--reverb`, `--white`
- `--white: #f0f0f0` — primary text/high-contrast; defined in `main.css :root`
- Color semantics: yellow = estimate/pending, green = actual/positive, red = cost/negative, blue = action

---

## Views

| View | Default filters | Notes |
|---|---|---|
| Dashboard | — | KPIs, lot recovery table, recently sold |
| Items | Status: Listed, Site: All | Daily driver — inline status edit, EAF payout column |
| Lots | All lots | Click row → Lot Detail modal |
| Catalog | — | Disc catalog intake form; saves to Google Sheet |

### Items View — Sort Architecture
Sort state lives in `itemsView` local state (`sortKey`, `sortDir`). Applied at end of `rows` getter after filtering. Default: `createdTime DESC`.

- `sortBy(key)` — toggles dir if same key, else sets new key + `'asc'`
- `sortIndicator(key)` — returns `' ↑'`, `' ↓'`, or `''`
- `<th class="sortable" :class="{'sort-active': sortKey==='x'}" @click="sortBy('x')">`
- Same pattern used in `lotsView`

**Date formatting convention** — `toLocaleDateString('en-US', { month: 'short', day: 'numeric' })` → `"Mar 15"`. Style: `color:var(--muted); white-space:nowrap`. Always first column.

### Items View — Filter Architecture
Three independent filter axes, all applied in `itemsView.rows` getter:

| Filter | Lives in | Default |
|---|---|---|
| `statusFilter` | `itemsView` local state | `'Listed'` |
| `siteFilter` | `itemsView` local state | `'All'` |
| `categoryFilter` | `$store.dw` | `null` (= no filter) |

**Navigating with filters** — use `$store.dw.navToItems(status, category, site)`. Sets `pendingFilters` on the store (single object so watcher always fires); `itemsView` consumes it on next tick. Unspecified args default to `'All'`/`null` — every navigation is a clean slate.

**Rule:** clicking any status or site pill clears `categoryFilter`. Pills represent complete filter state — never silently combine with a hidden category filter.

**Item modal drill-down** — Status, Category, and Site badges are clickable and call `navToItems()`. Lot field calls `openModal('lot', null, lotName)`.

---

## Sidebar

- **ADD ITEM** → opens Add modal
- **Quick Find** — live search against `$store.dw.records` in memory (no API calls)
  - Results: Items (→ Item modal), Lots (→ Lot modal), Categories (→ Items view filtered)
  - Sold items shown dimmed, not hidden
  - Keyboard: `/` or `cmd+k` focuses; ↑/↓ navigates; Enter selects

---

## Modal Patterns

### Modal Back-Navigation
- `store.previousModal` — stashes `{ type, recordId, lotName }` before opening a child modal
- `closeModal()` restores previous modal if set, then clears it
- Used by lot modal's `openItem()` so Close returns to the lot
- `navToItems()` clears `previousModal` before closing to prevent unintended restores
- Lot modal escape handler guarded with `activeModal === 'lot'` check to prevent double-fire

### Label Modal — Ship Workflow
- Weight input is lbs + oz (combined as `lbs + oz/16` for API)
- On open: fetches Reverb or eBay order to auto-fill shipping address
- On label purchase: auto-fires `saveShipping()` + `markShipped()` immediately — don't wait for button
- `saveShipping()` writes shipping cost + status=Sold + dateSold + sale price + tracking, then calls `fetchAll()`
- Sale price: `order.direct_checkout_payout` (post-fee) with fallback to `order.amount_product.amount`
- `date_sold`: uses `platformSaleDate` (from Reverb `created_at` / eBay `creationDate`) with fallback to today
- `activeReverbOrderNum` / `activeEbayOrderId` — store fields set by sync modals before opening label modal; cleared on read in `_open()`

### Shipping Modal — In Transit
- Shows sold+tracked items not yet delivered, or delivered within last 3 days
- Filter logic: `store.isInTransit(r, trackingData)` — update window there, not in each view
- `deliveredAt` extracted from EasyPost `tracking_details` event with `status === 'delivered'`
- EasyPost test mode uses historical fake delivery dates — items may disappear immediately after delivery; expected behavior

### Reverb Sync Modal — Sections
- **Awaiting Shipment** — matches orders to records by `reverbListingId`; SHIP button opens label modal
- **Link Listings** — links unlinked Listed/Reverb records to Reverb listing ID via dropdown
- **Listing Details** — computes name/price diffs; SYNC applies selected changes
  - Listings fetched with full pagination (follows `_links.next.href`)
  - Diffs computed in `_process()` from already-fetched `this.listings` — zero extra API calls
  - `syncDetails()` calls `dw.fetchAll()` before `_process()` — **important pattern**: any modal write updating fields visible in other modals must call `fetchAll()` first so store is fresh before re-diffing

### Reverb API `_links` Structure
- `_links.ship.href` — direct href, POST to mark order shipped
- `_links.packing_slip.web.href` — public reverb.com URL, open directly (no proxy needed)
- `order.direct_checkout_payout` — post-fee seller payout; `order.amount_product.amount` is pre-fee
- `order.shipping_address` — buyer address

---

## Comp Research View

Two-step pipeline: **search** raw listings → **analyze** with Claude.

**Entry points:**
- Direct nav: sidebar "Comps" pill → empty form
- From item modal: "Research Comps" → `store.navToComp(r)` → populates `store.pendingComp` → `compsView.init()` pre-fills on next tick

**`store.navToComp(r)` pre-fill logic:**
- `name` — first segment of `r.name` before ` - `
- `notes` — remainder after ` - `
- `sources` — inferred from item's active listing site; falls back to `'ebay'`
- `minPrice` — 60% of current list price

**Search** (`POST /api/comps/search`):
- eBay: SerpAPI `engine=ebay`, `show_only=Sold`, optional `_udlo` (min price). Up to 50 results.
- Reverb: Puppeteer + stealth plugin scrape of `reverb.com/marketplace?show_only_sold=true`. First page only (~20–30 listings). Requires `CHROME_PATH` in `.env`.
- Both sources parallel per item; items parallel across each other.

**Analyze** (`POST /api/comps/analyze`):
- Sends listings to Claude (`claude-sonnet-4-6`). System prompt from `docs/gear-comp-research.md` — changing that doc changes AI behavior.
- Response parsed into `ANALYSIS:` paragraph + `CSV:` fenced block.
- Sequential (not parallel) to avoid rate limits.

---

## Debugging Alpine Issues

- **Always ask for browser console output** first. Alpine expression errors give exact expression + element.
- Alpine expression errors crash reactivity for that binding — symptoms can look unrelated to root cause.

**Common pitfalls:**
- `x-if="!someGetter"` renders when getter returns false for null state — guard: `x-if="record && !someGetter"`
- Direct property access in templates (`record.fields[x]`) throws if object is null — use `record?.fields?.[x]` or `x-show="record"` outer guard
- `x-show` hides elements but Alpine still evaluates all bound expressions — only `x-if` prevents evaluation
- `Alpine.effect(() => { ... })` works inside `Alpine.store` init() for reactive side effects
- `x-for="(item, i) in list"` — use when you need the loop index in template expressions
- For hard-to-reproduce bugs: add `console.log` inside store methods or `init()` hooks, ask Geoff to trigger and share output
