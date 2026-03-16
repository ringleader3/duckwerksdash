# Duckwerks Dashboard v2 — Build Plan
_For Claude CLI to execute phase by phase_

---

## What We're Building

A parallel v2 dashboard at `localhost:3000/v2` using Alpine.js for reactivity.
The existing `duckwerks-dashboard.html` stays live and untouched throughout.

**Stack:**
- Alpine.js v3 (CDN, no build step)
- Vanilla JS modules loaded via `<script src>` in order
- Same Express server — just add static routing for `/v2`
- Same Airtable backend, same `.env`, same field IDs from `F{}`
- Same Shippo + Reverb server proxies — no server changes needed

---

## File Structure

```
public/v2/
  index.html          ← shell: layout, CDN scripts, view containers
  css/
    main.css          ← design tokens, layout, sidebar, typography
    components.css    ← badges, pills, cards, tables, modals
  js/
    config.js         ← F{} field map, BASE_ID, TABLE_ID, constants
    store.js          ← Alpine.store('dw', {...}) — all data + helpers
    sidebar.js        ← Alpine.data('sidebar', ...) — search + nav state
    views/
      dashboard.js    ← Alpine.data('dashView', ...)
      items.js        ← Alpine.data('itemsView', ...)
      lots.js         ← Alpine.data('lotsView', ...)
    modals/
      item-modal.js   ← Alpine.data('itemModal', ...)
      add-modal.js    ← Alpine.data('addModal', ...)
      lot-modal.js    ← Alpine.data('lotModal', ...)
      label-modal.js  ← Alpine.data('labelModal', ...) — ported from v1
      reverb-modal.js ← Alpine.data('reverbModal', ...) — ported from v1
```

Add to `server.js`:
```js
app.use('/v2', express.static(path.join(__dirname, 'public/v2')));
```

---

## Design System

Carry forward from v1 — do not redesign:
- Dark theme
- `Space Mono` for body/data, `Bebas Neue` for large numbers
- CSS vars: `--green`, `--yellow`, `--red`, `--blue`, `--purple`, `--orange`, `--muted`, `--surface`, `--border`, `--border2`, `--ebay`, `--reverb`
- Color semantics: yellow = estimate/pending, green = actual/positive, red = cost/negative, blue = action

---

## Sidebar Layout

Fixed left sidebar. Three sections:

```
DUCKWERKS
─────────────────
[ + ADD ITEM ]        ← button → opens Add modal (@click="$store.dw.openModal('add')")

🔍 [quick find...]    ← live search input, searches name/lot/category
   result rows appear below, each with type icon + badge
   click → opens appropriate modal or navigates to view

─────────────────
NAV
  ◉ Dashboard
  ○ Items
  ○ Lots

─────────────────
ACTIONS
  Sync Reverb
```

**Quick Find behavior:**
- Searches against `$store.dw.records` in memory — no Airtable calls
- Matches on: item name, lot name, category name
- Result row types:
  - Item → shows name + status badge + lot tag → click opens Item modal
  - Lot → shows lot name + item count + recovery % → click opens Lot modal
  - Category → shows "Music — 12 listed" → click navigates to Items view filtered to that category
- Sold items appear in results but are visually dimmed
- Clear input to dismiss results

---

## Alpine Store (`store.js`)

```js
Alpine.store('dw', {
  // --- state ---
  records: [],
  lots: [],
  loading: false,
  airtablePat: null,
  activeView: 'dashboard',       // 'dashboard' | 'items' | 'lots'
  activeModal: null,             // 'item' | 'add' | 'lot' | 'label' | 'reverb'
  activeRecordId: null,
  activeLotName: null,

  // --- init ---
  async init() {
    const cfg = await fetch('/api/config').then(r => r.json());
    this.airtablePat = cfg.airtablePat;
    await this.fetchAll();
  },

  async fetchAll() {
    this.loading = true;
    // fetch all records from Airtable inventory table
    // fetch all lots from Airtable lots table
    // populate this.records and this.lots
    this.loading = false;
  },

  // --- modal helpers ---
  openModal(type, recordId = null, lotName = null) {
    this.activeModal = type;
    this.activeRecordId = recordId;
    this.activeLotName = lotName;
  },
  closeModal() {
    this.activeModal = null;
    this.activeRecordId = null;
    this.activeLotName = null;
  },

  // --- computed helpers ---
  get listedRecords() { return this.records.filter(r => r.fields[F.status] === 'Listed'); },
  get soldRecords()   { return this.records.filter(r => r.fields[F.status] === 'Sold'); },
  get pendingRecords(){ return this.records.filter(r => r.fields[F.status] === 'Pending'); },

  // --- data helpers (same as v1) ---
  str(r, field)  { return r?.fields?.[field] ?? ''; },
  num(r, field)  { return parseFloat(r?.fields?.[field]) || 0; },
  eaf(p)         { return p > 0 ? Math.max(0, p * 0.9181 - 0.49) : 0; },
  fmt0(n)        { return '$' + Math.round(n).toLocaleString(); },
  siteLabel(r)   { /* derives 'Reverb' or 'eBay' from record */ },
})
```

**Rule:** No Airtable calls outside `store.js`. Views and modals read `$store.dw.*` only.

---

## View: Dashboard

Stat cards at top. Below that, 2–3 panels. Keep it additive — start simple, add charts as ideas emerge.

**Phase 1 cards (always shown):**
- Total Invested (all lots combined cost)
- Revenue (sum of actual sale prices, sold items)
- Profit (revenue - cost - shipping, sold items)
- Pipeline Value (eaf(listPrice) for all listed items)

**Phase 1 panels:**
- Lot Recovery table — each lot: cost, recovered, %, status bar
- Recently Sold — last 10 sold items, name + sale price + profit

**Add later (placeholders in UI, data TBD):**
- Monthly revenue trend chart
- Avg days to sell per category
- Lot ROI ranking

---

## View: Items

This is the daily driver. Defaults to: status = Listed, site = All.

**Controls row:**
- Status pills: All | Listed | Pending | Sold
- Site pills: All | Reverb | eBay
- Text search (filters name column)

**Table columns:**
- Name
- Lot
- Category
- Status badge
- List Price → EAF payout (yellow, calculated)
- Est. Profit (yellow, eaf - cost - ship estimate)
- Shipping (actual if set, else ~$10 in yellow)
- Actions: [Edit] [Ship] inline per row

**Inline status edit:** clicking the status badge opens a small dropdown in-row — no modal needed.

**Click row** (not a badge/button) → opens Item Detail modal.

---

## View: Lots

Table of all lots.

**Table columns:**
- Lot Name
- Date acquired
- Total Cost
- # Items (sold / listed / other)
- Recovered $ (sold earnings)
- Recovery % with progress bar
- Est. Upside (eaf of all listed items)

**Click row** → opens Lot Detail modal.

---

## Modals

### Item Modal (`item-modal.js`)
- Read view: all fields, EAF payout, est. profit, reverb listing/order IDs
- Edit view: inline — toggled with EDIT button
- Footer buttons: EDIT | SHIP | CLOSE
- SHIP button → opens Label modal (passes recId)
- Port logic directly from v1 modal

### Add Modal (`add-modal.js`)
- Form: Name, Lot (dropdown from lots), Category, Status, List Price, Cost, Notes
- On save: POST to Airtable, push to `$store.dw.records`, close modal

### Lot Modal (`lot-modal.js`)
- Lot stats: cost, recovery, pipeline, est. profit if all listed sell
- Break-even progress bar
- Full item table for that lot (same columns as Items view)

### Label Modal (`label-modal.js`)
- Direct port from v1 — same Shippo flow
- Reads `activeRecordId` from store, writes shipping cost back to Airtable + store

### Reverb Sync Modal (`reverb-modal.js`)
- Direct port from v1 — same order match + save flow

---

## Build Order (Phase by Phase)

### Phase 1 — Shell + Store
1. Add `/v2` route to `server.js`
2. Create `public/v2/index.html` — layout only (sidebar shell, 3 view containers, modal containers), no data
3. Create `css/main.css` — design tokens, sidebar, layout grid
4. Create `css/components.css` — badges, pills, stat cards, tables, modal overlay
5. Create `js/config.js` — `F{}` field map copied from v1, constants
6. Create `js/store.js` — Alpine store with `init()`, `fetchAll()`, helpers
7. Wire Alpine to index.html, confirm store loads and `records[]` populates
8. **Checkpoint:** `/v2` loads, sidebar renders, data is in store, no views yet

### Phase 2 — Sidebar + Navigation
1. Create `js/sidebar.js` — nav state, quick-find search logic
2. Build sidebar HTML in index.html — ADD button, search input + results, nav pills, actions
3. View switching via `$store.dw.activeView` + `x-show`
4. **Checkpoint:** Nav switches between blank view containers, search returns results from store

### Phase 3 — Items View (daily driver first)
1. Create `js/views/items.js`
2. Build items table in index.html — status pills, site pills, text search, table with inline status edit
3. EAF + est. profit calculated in render, shown yellow
4. **Checkpoint:** Items view works end-to-end with all filters

### Phase 4 — Item Modal + Add Modal
1. Create `js/modals/item-modal.js` — read + edit views
2. Create `js/modals/add-modal.js`
3. Wire ADD ITEM button in sidebar → add modal
4. Wire row click in Items view → item modal
5. **Checkpoint:** Can view, edit, and add items entirely from v2

### Phase 5 — Lots View + Lot Modal
1. Create `js/views/lots.js`
2. Create `js/modals/lot-modal.js` — stats, progress bar, item table
3. Wire lot row click → lot modal
4. **Checkpoint:** Lots view works, lot detail modal works

### Phase 6 — Dashboard View
1. Create `js/views/dashboard.js`
2. Build stat cards + Lot Recovery table + Recently Sold panel
3. Leave chart placeholders as empty panels with labels
4. **Checkpoint:** Dashboard shows real data from store

### Phase 7 — Port Operational Modals
1. Port Label modal from v1 → `js/modals/label-modal.js`
2. Port Reverb Sync modal from v1 → `js/modals/reverb-modal.js`
3. Wire SHIP button in item modal and items table
4. Wire SYNC REVERB in sidebar actions
5. **Checkpoint:** Full operational workflow works in v2

### Phase 8 — Polish + Cutover
1. Keyboard shortcut: `/` or `cmd+k` focuses sidebar search
2. Persist last active view to localStorage
3. "Needs attention" flags on Items view (listed > X days)
4. Smoke test all flows against live Airtable
5. Update `CLAUDE.md` and architecture doc to reflect v2 structure
6. Announce `/v2` as primary, keep `/` (v1) as fallback until confident

---

## Rules for Claude CLI During This Build

- Never read any file in full — grep first, then targeted reads
- One logical change per edit — no bulk rewrites
- After each phase checkpoint, confirm with Geoff before proceeding
- All Airtable writes go through store methods — never raw fetch in a view component
- No new dependencies — Alpine CDN + existing Express stack only
- Keep v1 (`duckwerks-dashboard.html`) completely untouched

---

## Key Values to Carry Forward from v1

```js
// Earnings after fees (Reverb: 5% selling + 3.19% processing + $0.49 flat)
const eaf = p => p > 0 ? Math.max(0, p * 0.9181 - 0.49) : 0;

// Est profit for listed items
const estProfit = (r) => {
  const listPrice = num(r, F.listPrice);
  const cost = num(r, F.cost);
  const shipEst = r.fields[F.shipping] != null ? num(r, F.shipping) : 10;
  return eaf(listPrice) - cost - shipEst;
};

// $10 dummy shipping shown in yellow when no actual shipping cost is set
// F.sale already stores post-fee payout — do NOT apply eaf() to it
```
