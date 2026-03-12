# Duckwerks Dashboard — Architecture Reference
_Last synced: dashboard v20_

> **Maintenance rule:** This doc must be updated in the same session as any structural change
> to `duckwerks-dashboard.html`. If a new function, state var, view, CSS class, or data field
> is added/removed/renamed, update the relevant section here and sync the version note above.

---

## ⚠️ CONTEXT BURN PREVENTION — READ THIS FIRST

**The HTML file is ~2000 lines. Reading it in full will exhaust the context window.**

### Rules Claude MUST follow — no exceptions:
1. **NEVER read `duckwerks-dashboard.html` in full** — use Grep + targeted Read with offset/limit.
2. **NEVER display or quote large sections of the file in responses.**
3. **Always use Grep to locate relevant lines by keyword first.**
4. **Then use Read with offset+limit to read only the section needed (±30 lines max).**
5. **Make all edits as surgical Edit (str_replace) calls.** One edit per logical change.
6. **Do not re-read sections you already read unless the file has changed.**

---

## File
- Single-file HTML app: `duckwerks-dashboard.html` (~2000 lines)
- Served by local Express server at `http://localhost:3000/duckwerks-dashboard.html`
- `VERSION` constant near `BASE_ID` at top of `<script>` block — bump on every structural change

---

## Data Layer
- Backend: Airtable (BASE_ID + TABLE_ID in `<script>` block; PAT now fetched from server via `/api/config`)
- `F` object maps logical field names to Airtable field IDs (e.g. `F.name`, `F.status`, `F.profit`, `F.lot`, `F.category`, `F.listPrice`, `F.sale`, `F.shipping`, `F.cost`, `F.reverbListingId`, `F.reverbOrderNum`)
- `records[]` — global array of raw Airtable records, populated by `fetchAll()`
- `siteLabel(r)` — derives 'eBay' or 'Reverb' from record fields
- Helper functions: `str(r, field)`, `num(r, field)`, `fmt0(n)`, `fmtK(n)`, `pct(a,b)`, `esc(s)`, `clamp(v,lo,hi)`, `eaf(p)`

### `eaf(p)` — Earnings After Fees
```js
const eaf = p => p > 0 ? Math.max(0, p * 0.9181 - 0.49) : 0;
```
- Reverb fee structure: 5% selling fee + 3.19% payment processing + $0.49 flat
- Applied to `listPrice` for all "pending/upside" calculations on listed items
- **Do NOT apply to `F.sale`** — that field already stores actual post-fee payout

### Estimated Profit for Listed Items
- `estP = eaf(listPrice) - cost - shipEst` where `shipEst = r.fields[F.shipping] != null ? actual : 10`
- Shown in **yellow** in PAYOUT and PROFIT columns for listed items in all tables and modal
- `$10` dummy shipping shown in yellow as placeholder when no shipping cost is set
- Modal label reads "ACTUAL SHIP" vs "~$10 SHIP" based on whether shipping is set

---

## View System
- `showView(name, lotName)` — switches between views by toggling element visibility
- Views: `overview`, `categories`, `items`, `lot`, `update`, `add`
- Each view has a `<div id="X-content">` container and a corresponding `renderX()` function
- Lot view uses `renderLotDetail(lotName)` and `$('lot-content')`

---

## Key Render Functions
- `renderOverview()` — stat cards, top earners bar chart, pipeline donut, platform/category charts, margin bars
- `renderCategories()` — per-category panels with donuts; has site pill filter (`catSiteFilter`)
- `renderItems()` — all items table with search, cat/site dropdowns, status pills (`itemStatusFilter`)
- `filterItems()` — reads `itemStatusFilter` module var + DOM dropdowns, re-renders table
- `renderLotDetail(lotName)` — lot stats including NET EARNINGS (sold items only) and LOT PROFIT (vs full lot cost), pipeline donut, per-item bar chart, full items table
- `renderUpdate()` — update queue; search restores focus after re-render; defaults to `listed` filter
- `renderAdd()` — add new item form
- `updateCard(r)` — renders a single update card; has SHIP button for all items (any status)

---

## Module-Level State Vars (near top of script)
- `currentView`, `currentLotName`
- `itemStatusFilter` — active status pill ('', 'Sold', 'Listed', etc.)
- `catSiteFilter` — active site filter in Categories ('' / 'eBay' / 'Reverb')
- `updateSearch`, `updateFilter` — default `updateFilter = 'listed'`

---

## Chart Helpers
- `donut(slices, total)` — SVG donut chart; slices have `{label, val, color, dollar?}`; dollar shows $ sub-label in legend
- `marginBars(sold)` — horizontal bar breakdown of revenue/shipping/cost/profit
- `CAT_COLOR{}`, `CAT_BADGE{}` — maps category name → CSS color var / badge class

---

## CSS Conventions
- CSS vars: `--green`, `--yellow`, `--red`, `--blue`, `--purple`, `--orange`, `--muted`, `--surface`, `--border`, `--border2`, `--ebay`, `--reverb`
- Badge classes: `badge-sold`, `badge-listed`, `badge-other`, `badge-prepping`, `badge-music`, `badge-comp`, `badge-gaming`, `badge-ebay`, `badge-reverb`
- Stat card accent: `.stat-card.green`, `.red`, `.yellow`, `.blue`, `.purple`
- Pill buttons: `.pill-btn`, `.pill-btn.active` — used for status and site filters
- Layout: `.stat-grid`, `.grid-2`, `.grid-3-1`, `.panel`, `.panel-title`, `.bar-chart`, `.bar-row`, `.data-table`
- Color semantics: **yellow = estimate/pending**, **green = actual/positive**, **red = cost/negative**, **blue = action**

---

## Item Detail Modal
- `openModal(recId)` / `closeModal()` — inspect/edit any record
- `openModalEdit(recId)` / `saveModalEdit(recId)` — inline edit fields
- EDIT button: `id="modal-edit-btn"`, `onclick="toggleModalEdit()"`
- SHIP button: `id="modal-ship-btn"`, shown for `Listed` and `Sold` items only, `onclick="openLabelModal(currentModalId)"`
- Modal already shows EAF for listed items and EST. PROFIT with shipping label
- Read-only view shows REVERB row (listing ID + order number) if either is set on the record
- Edit view includes REVERB LISTING ID field (`me-reverb-listing-id`) saved to `F.reverbListingId`

---

## Label Modal (Shippo)
- Second overlay: `id="label-overlay"`, `id="label-box"`, `id="label-body"`
- `SHIPPO_TEST_MODE` — boolean const in CONFIG section; flip to `false` for live
- `openLabelModal(recId)` — async; opens modal, auto-fetches Reverb order by `F.reverbOrderNum` if set and `labelAddrText` is empty, then calls `renderLabelForm()`
- `closeLabelModal()` / `maybeLabelClose(e)`
- `parseAddress(text)` — parses pasted address block: Name / Street1 / [Street2] / City State Zip / [Country]
- `renderLabelForm()` — address textarea + package type toggle (BOX / POLY BAG) + weight + dims
- `labelSetType(type)` — switches BOX/POLY BAG, clears inapplicable fields
- `labelGetRates()` — validates form, POSTs to `/api/label/rates`, shows rates step
- `renderLabelRates(rates)` — clickable rate cards sorted cheapest first
- `labelPurchase(rateId, price)` — POSTs to `/api/label/purchase`, shows result step
- `renderLabelResult(result, price)` — tracking number (with copy), label URL, save button
- `labelSaveShipping(price)`:
  - If `inp-ship-{recId}` exists in DOM (Update view open) → fills field, closes modal, user saves via SAVE button
  - Otherwise (opened from item modal) → saves shipping cost directly to Airtable

---

## Reverb Integration

### Sync Modal
- Nav sidebar ACTIONS section → "SYNC REVERB" → `openReverbSync()`
- Overlay: `id="reverb-sync-overlay"`, body: `id="reverb-sync-body"`
- `runReverbSync()` — fetches `GET /api/reverb/my/orders/selling/awaiting_shipment`
- Matches each order's `product_id` to `F.reverbListingId` in `records[]`
- `renderReverbSyncResults(orders)` — shows MATCHED / UNMATCHED sections, SAVE button
- `saveReverbMatches()` — PATCHes `F.reverbOrderNum` on matched Airtable records
- `reverbAddrToText(a)` — formats Reverb `shipping_address` object → textarea string

### Server proxy
- `GET /api/reverb/*` — generic Reverb API proxy; injects `Authorization: Bearer REVERB_PAT` from `.env`

### Label Modal State Vars
- `labelRecId` — current record being shipped
- `labelAddrText` — persists textarea value across step transitions
- `labelParcel` — `{ type, weight, length, width, height }` persists across steps

---

## Edit Workflow (for Claude)
1. Grep for keyword to find line numbers — **never read the full file**
2. Read with offset+limit to read only the needed section
3. Surgical Edit (str_replace) — one edit per logical change
4. Bump `VERSION` constant in HTML config section
5. Update this architecture doc if anything structural changed
6. Remind Geoff to commit when the session wraps up

## Version Control
- GitHub: https://github.com/ringleader3/duckwerksdash (private)
- Commit after any meaningful session of changes
