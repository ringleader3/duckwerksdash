# Session Log
_Most recent first. Update this at the end of every session._

### 2026-03-27 — v0.9.7 (UI cleanup batch)
- **#54 — CLOSED:** Sidebar nav dots now reactive — active view shows `◉`, others show `○`.
- **#59 — CLOSED:** Removed Actions column (Edit + Ship buttons) from items view. Row click opens item modal; Ship is accessible from there.
- **#57 — CLOSED:** Modal footer normalization — Save/Cancel now inline in footer (was split across body/footer); removed all Close buttons; suppressed click-outside dismiss (ESC or ✕ only); softened Delete button (no more red alarm styling).
- **#56 — CLOSED:** Modal section headers more visually distinct (bottom border added). "Status & Classification" → "Item Details" in view mode; "Edit Item" → "Item Details" in edit mode. Add modal gains "Item Details" and "Financials" section headers. "Platform" → "Site" in Add modal.

### 2026-03-26 — v0.9.6
- **Lot modal + lots view — zero cost recovery pct:** Applied same items-sold/total fallback to `recoveryPct()` in lot-modal.js and lots.js so geoffcam-style lots show meaningful progress instead of 0%.

### 2026-03-26 — v0.9.5
- **Lot Recovery widget — header alignment:** Added `text-align: right` to `.num-col` so Cost/Recovered/%/Pipeline headers align with right-aligned data.
- **Lot Recovery widget — zero cost basis:** Lots with no cost (e.g. geoffcam) now show items-sold/total-items % instead of a misleading 0%. Fallback to `—` only if the lot has no items.

### 2026-03-26 — v0.9.4
- **Item modal edit — payout field not saving:** `form.sale` was populated in `startEdit()` but never written back on save. Added `updateOrder()` call + `fetchAll()` so the store reflects the updated sale price immediately.

### 2026-03-26 — v0.9.3
- **#46 — CLOSED:** Validated `paymentSummary.totalDueSeller` is available pre-fulfillment on first real eBay order (Nikon 50mm, $100.69 payout). Simplified eBay payout fallback chain to just `totalDueSeller` — removed `totalMarketplaceFee` and fee-formula fallbacks.
- **eBay label modal success state:** ✓ SHIPPED ON EBAY button now shows green (was red/`--ebay`), matching ✓ SAVED. ORDER DETAILS hidden after successful shipping to reduce button row clutter. Filed #51 to validate on next order.
- **Categories expanded:** Added A/V Gear, Camera, Comics/Books/Media, Home, Junk Drawer. Badge CSS + config.js updated. Bulk-reconciled all non-Reverb items into correct categories (Camera: Nikon lenses/body/flash, Insta360; A/V Gear: NAD, Technics, HDMI switches, Bose, Roku, Samsung TV/BRP, Sony CD-R; Home: AC unit).

### 2026-03-26 — v0.9.1.1 (Hotfix)
- **Chart top clipping:** Label text on the tallest bars was being clipped by the canvas edge. Added top padding to chart layout for label clearance.

### 2026-03-26 — v0.9.1 (Momentum chart)
- **#48 — CLOSED:** Wrote and reviewed implementation plan for momentum chart (`docs/superpowers/plans/2026-03-26-momentum-chart.md`). Code-reviewed and patched before implementation: listing selector fix (`l.order` not `l.status`), tooltip gross computation, x-show/flex conflict, eBay capitalization.
- **#49 — CLOSED:** Implemented momentum chart. Replaces 4-chart analytics grid with a single full-width chart. Windows: 3d/7d/14d/30d (dropped 60d/90d — skewed scale). Hero background bar (custom `beforeDatasetsDraw` plugin) shows total gross/net as a wide translucent wash behind per-site bars. Log y-axis for near-term readability. Gross · net text labels above each cluster. Per-bar site labels (Reverb/eBay in bar color) below each bar. Moved to hero position below KPIs.
- **#50 — CLOSED:** Validated in browser throughout session.

### 2026-03-26 — v0.9.0 (versioning + polish)
- **#40 — CLOSED:** Added semantic versioning. `APP_VERSION` constant in `config.js` displayed in sidebar footer as "Duckwerks Dashboard v0.9.0". `package.json` set to `0.9.0`. Versioning section added to CLAUDE.md: major=re-arch, minor=feature set, patch=session. Tags every patch, GH releases starting at first minor post-1.0.
- **#47 — CLOSED:** Fixed view flicker during batch sync. `updateItem`/`updateListing` now accept `{ skipRefresh: true }` — batch loops in both Reverb and eBay modal `syncDetails()`/`saveLinks()` skip per-update store mutations and let the existing end-of-loop `fetchAll()` do a single clean re-render.
- **eBay modal section order:** Reordered to match Reverb — Awaiting Shipment → Link Listings → Listing Details → New on eBay.

### 2026-03-26 (KPI + calculation fixes)
- **Upside/pipeline KPIs:** Were using `payout()` (EAF, no shipping subtracted) — switched to `estProfit()` so they match the per-row profit column sum. Also fixed filter to `Listed` only — Prepping items have no list price and were pulling numbers negative.
- **Lot modal EST. TOTAL PROFIT:** Was mixing revenue (`recovered`) with est. profit then double-subtracting cost. Fixed to `soldProfit + estUpside` — cost is already baked into `estProfit`.
- **Gross Pending KPI:** New stat card showing EAF payout sum for listed items (before cost basis). Upside Pending now clearly labeled "after cost+fees". Both use `Listed` filter only.

### 2026-03-26 (QoL fixes)
- **Dashboard reorder:** KPIs → In Transit → Recently Listed → Lot Recovery (full width) → Recently Sold (full width) → Analytics
- **Delete item:** `DELETE /api/items/:id` route cascades to listings → orders → shipments via FK cascade. Button in item modal footer (red, right-aligned, confirm dialog). Verified no orphans post-delete.
- **Item edit modal:** "Reverb Listing ID" label now dynamic — shows site name or "Platform" when no site selected.
- **Item modal parity:** Reverb packing slip link added (`/my/orders/{id}/packing_slip.pdf`). eBay gets Order Details + Packing Slip links. Both platforms show order link + packing slip in item modal when `platform_order_num` is present. Same buttons in label modal result step for eBay.

### 2026-03-26 (eBay ship flow validation + packing slip links)
- **Item modal parity:** Added eBay Order Details + Packing Slip links to item modal eBay row (`platform_order_num` required). Added Reverb Packing Slip link (`https://reverb.com/my/orders/{id}/packing_slip.pdf`). Both platforms now show order link + packing slip inline. Label modal result step also has ORDER DETAILS + PACKING SLIP buttons for eBay.

### 2026-03-26 (eBay ship flow validation)
- **#31 — CLOSED:** Validated full eBay ship flow on first real order (Yongnuo YN560 Flash Kit). Fixed four bugs: (1) address was pulling `buyerRegistrationAddress` (Paraguay) instead of `fulfillmentStartInstructions[0].shippingStep.shipTo` (Miami); (2) tracking not pushed to eBay — added `markShippedEbay()` that auto-fires after label purchase, POSTs to `/api/ebay/orders/:id/tracking`; (3) shipped items kept reappearing in Awaiting Shipment — `_process()` now skips records with a `tracking_number`; (4) added MARK SHIPPED ON EBAY button + ORDER DETAILS link in label modal result step. Also: `ebayOrderId` falls back to `r.order?.platform_order_num` so SHIP button works from item modal on already-processed orders. `platform_order_num` now saved for eBay orders.
- **#46 — Awaiting Validation:** eBay payout field availability unknown pre-fulfillment. Current fallback chain: `paymentSummary.totalDueSeller` → `total - totalMarketplaceFee` → fee formula estimate. Console logging in place — next order will reveal which fields eBay returns before shipping. `pricingSummary` vs `paymentSummary` — different objects, easy to confuse. Item 62 (Yongnuo) patched to correct payout of $57.23.

### 2026-03-26 (New on eBay import)
- **#45 — follow-up:** Added "NEW ON EBAY" import section to eBay sync modal. The HTML stub existed from the #45 session but JS was never wired up. `_process()` now computes `newListings` (Browse API listings with no matching local `platform_listing_id`), `importNew()` creates item + listing records (cost=0, URL constructed from `legacyItemId`). Mirrors the Reverb "New on Reverb" pattern exactly. Added `legacyItemId` dedupe in `_process()` — eBay's search index can briefly return the same listing twice, which caused one duplicate import before the fix.

### 2026-03-26 (eBay Browse API + listing details)
- **#45 — CLOSED:** eBay Browse API working. `category_ids=0` returns all active seller listings in one call. Added `getAppToken()` (client credentials, in-memory cache) to `ebay-auth.js`. New `GET /api/ebay/listings` route in `server/ebay.js` paginates via offset. eBay modal now fetches orders + listings in parallel on open. Link Listings dropdown populated from live listings instead of manual paste. Added LISTING DETAILS section (mirrors Reverb) — diffs title+price against live Browse API data, SYNC writes name to item and list_price to listing. Added `listingUrl(r)` to store — constructs `https://www.ebay.com/itm/{id}` or `https://reverb.com/item/{id}` from platform_listing_id; item modal listing link now always clickable for eBay/Reverb items (no longer depends on stored `url`).
- **`EBAY_SELLER_USERNAME=duckwerks`** added to `.env` — required for Browse API seller filter.

### 2026-03-26 (Reverb + eBay listing sync)
- **#44 — CLOSED:** Reverb sync modal now has a "NEW ON REVERB" section. Compares live Reverb listings against local `platform_listing_id`s; shows unmatched listings with checkboxes; IMPORT creates item + listing records (title, price, listing ID, site=Reverb). Defaults cost=0, category=null — fill in after import.
- **#38 — UPDATED:** eBay listing sync investigated. eBay Inventory API (`sell.inventory`) only returns listings created through it — legacy listings (created on eBay website) return empty. Listing Details + New on eBay sections were built then removed. What shipped: (1) Link Listings changed from order dropdown to text input — paste listing ID from eBay URL; (2) item modal "REVERB" label replaced with dynamic site name, links via stored listing URL instead of hardcoded Reverb URL; (3) `sell.inventory` scope added to OAuth + re-auth completed; (4) `Accept-Language` header added to all eBay requests. eBay listing read API deferred to #39 (Trading API path).
- **eBay listing ID flow:** `platform_listing_id` is required for the eBay ship flow — orders match against it. Without it, all eBay orders land in unmatched with no SHIP button. Current workflow: create item in dashboard → create listing on eBay website → Link Listings in Sync eBay to connect them.

### 2026-03-25 (Reverb sync → ship flow + date_sold fixes)
- **#42 — Awaiting Validation:** Reverb sync → ship flow had three compounding bugs: (1) `syncDetails()` calls `updateListing()` per diff, each triggering `fetchAll()` → `buildCharts()` — rapid destroy+recreate of Chart.js instances left destroyed charts with pending RAF callbacks firing on null ctx → infinite loop. Fix: debounce `buildCharts()` 50ms. (2) SHIP button condition required `platform_order_num` to match, but `saveMatches()` skips `updateOrder()` when no local order exists — button stayed hidden forever. Fix: show SHIP when `!item.rec.order` too. (3) Label modal fell back to `platform_listing_id` as order number → 404 on Reverb orders API. Fix: Reverb modal SHIP button sets `store.activeReverbOrderNum` (same pattern as `activeEbayOrderId`), label modal reads and clears it. Validated end-to-end on Behringer MicroAMP HA400 — order/shipment/tracking all landed correctly.
- **#43 — Awaiting Validation:** `saveShipping()` always used today as `date_sold`. Now extracts `order.created_at` (Reverb) and `order.creationDate` (eBay) into `platformSaleDate`; falls back to today only if unavailable. Also fixed item modal date display — was parsing date-only strings as UTC midnight, showing one day early in Pacific. Fix: append `T00:00:00` to force local parse. Added `scripts/fix-sold-dates.js` to backfill correct dates from last 20 Reverb orders — fixed 2 records (MXR M222 Talkbox: test artifact Mar 25→Mar 24; Blue Snowball: Mar 19→Mar 22).

### 2026-03-25 (Recently Sold bug fix)
- **#41 — CLOSED:** Recently Sold showed 12 old eBay items with a fake sold date of Mar 24. Three compounding bugs: (1) migration fallback used today's date when Airtable had no `dateSold`; (2) dashboard `recentlySold` getter fell back to `created_at` for items with no `date_sold`; (3) `soldDate()` parsed date-only strings as UTC midnight, shifting display back one day in Pacific time. Fix: filter `recentlySold` to items with a real `date_sold`, fix timezone parse, null out the 12 bad DB rows (confirmed no dates in Airtable either).

### 2026-03-25 (Label print + reprint session)
- **#35 — CLOSED:** Fixed label printing after a long debugging session. Root cause: `document.write` into a popup doesn't reliably apply CSS, and `@page` size/landscape hints are ignored by Chrome's print dialog. Solution: server-side PDF generation via `pdfkit`. New route `GET /api/label/print-pdf?url=<encodedUrl>` fetches EasyPost PNG, wraps it in an 11×8.5 landscape PDF. Chrome PDF viewer respects embedded page size → dialog defaults to landscape. Label positioned at 0.5in left, 1.25in top to center on 2-up 4×6 label sheet. `printLabel()` in store.js now just calls `window.open('/api/label/print-pdf?url=...')`.
- **Label print debugging notes:** CSS `@page { size: landscape }` is unreliable in Chrome for blob/popup windows. Blob URL approach works better than `document.write` but still can't force print dialog orientation. Only a natively landscape PDF (via pdfkit or similar) reliably sets the dialog. For UI bugs involving print/layout, a screen recording or side-by-side PDF preview comparison is far more useful than text descriptions.
- **#29 — CLOSED:** Reprint Label button was hidden behind `x-show="!trackingInfo"` — invisible whenever tracking data was loaded. Moved it alongside CLEAR TRACKING so it's always visible when `label_url` is present. Validated: `label_url` saves correctly, tracking clears correctly (nulls tracking fields, preserves label_url + shipping_cost).
- **Reverb order number fix:** `orderNum` in label modal now uses `r.order?.platform_order_num` first, falling back to `listing?.platform_listing_id`. Ensures correct Reverb order is fetched when order number differs from listing ID.
- **#31 — Awaiting Validation:** No changes. Still needs a real eBay order to validate end-to-end.

### 2026-03-25 (SQLite validation + cutover session)
- **#36 — CLOSED:** Full audit and fix of SQLite branch — hardcoded category list in addModal, stale function names in lotsView/lotModal, item modal `x-if` on div → `<template x-if>` (caused all record.* errors on page load), add modal missing `form.site`/`form.listPrice`/`form.shipping`/`form.status` from save logic, edit modal field name mismatches (`list_price`→`listPrice` etc.) and missing site handling, `site_id` not in listings PATCH allowed list.
- **#33 — CLOSED:** SQLite implementation was complete; closed on merge.
- **#34 — CLOSED:** Validation passed. Merged `feature/sqlite-migration` → `main`. Airtable base kept online read-only as backup.
- **Add/Edit flow:** Items, listings, and lots all create correctly. Site resolves to listing (not item field). Status respected even when listing auto-sets Listed. Devil duck favicon added.
- **Key debugging note:** `x-show` evaluates all bindings inside even when hidden — use `<template x-if>` to prevent null-record crashes in modals.

### 2026-03-24 (eBay integration session)
- **#31 — IN PROGRESS:** eBay Sell Fulfillment API integration. OAuth setup complete (tokens in `data/ebay-tokens.json`). Server routes: GET orders, GET single order, POST tracking. Frontend: Sync eBay sidebar button + `ebayModal` component — Awaiting Shipment (matched by `legacyItemId` ↔ `platform_listing_id`) + Link Listings sections. Label modal updated to fetch eBay buyer address via `activeEbayOrderId` store field and use `totalDueSeller` as payout. Awaiting first real eBay order to validate end-to-end.
- **eBay OAuth callback:** Deployed `duckwerks.com/ebay-oauth-callback.php` to receive auth code (eBay Production requires HTTPS; localhost not allowed). One-time flow: visit `/api/ebay/auth` → sign in → code displayed on duckwerks.com → run curl to `/api/ebay/auth/exchange`. Re-auth needed in ~18 months.
- **eBay listing sync:** Deferred — requires Sell Inventory API (managed inventory) or Trading API (legacy). Unclear which applies to this account. File follow-up after confirming.
- **duckwerks.com:** Added `ebay-callback.php` (account deletion webhook) and `ebay-oauth-callback.php`. Both deployed. SSH known_hosts issue fixed (`ssh-keygen -R gator3314.hostgator.com`). Fixed rsync wiping `ebay-deletion-log.txt` — added `--filter='protect ebay-deletion-log.txt'` to `deploy.sh`. Added `fetch-ebay-log.sh` helper.

### 2026-03-22 (UPS rates fix session)
- **UPS rates missing — FIXED:** `label_size: 'letter'` (set last session) is not a valid EasyPost enum for UPS — UPS silently drops from the rates response when it can't honor the label_size option. Switched to `'8.5X11'` which is cross-carrier and produces the same 8.5x11 PDF output.
- **Debugging tip:** EasyPost returns a `messages` array in the shipment response with per-carrier rate errors. Log `data.messages` to diagnose missing carriers — the UPS error was `"label_size: value is not a valid enumeration member; permitted: '4X6', '4X8', '4X4', '6X4', '8.5X11'"`. EasyPost auto-includes all linked carrier accounts; no need to specify them explicitly.

### 2026-03-22 (API + label printing session)
- **#30 enhancement (P2) — DONE:** Removed redundant `fetchAll()` calls in `label-modal.js` (`saveShipping()`) and `item-modal.js` (`clearTracking()`). `updateRecord()` already updates the local store in-place from the PATCH response — a full refetch was unnecessary. Reduces Airtable API usage on every label purchase and item save.
- **EasyPost label size:** Changed `label_size` from `'4X6'` to `'letter'` in `server/label.js` — later corrected to `'8.5X11'` (see next session) because `'letter'` is not a valid UPS enum value and silently blocked UPS rates.
- **#29 enhancement (P2) — awaiting validation:** Persist `labelUrl` to Airtable on label purchase (`F.labelUrl = fld6gsm3lU2L1cK4V`). Saved in `saveShipping()` alongside tracking fields. Item modal Shipment section shows "↗ Reprint Label" link when field is populated. Validate on next live label purchase.

### 2026-03-20 (Site-aware fees + add modal shipping session)
- **Site-aware fee lookup:** Added `SITE_FEES` table to `store.js` — fee functions keyed by site label. Reverb: 5% + 3.19% + $0.49 (item price only). eBay: 13.25% on total (item + shipping) + $0.40 flat (consumer electronics rate — verify after first AV sale). Facebook: no fees. Unknown sites fall back to no fees.
- **`estProfit()` updated:** Now uses `SITE_FEES[siteLabel(r)]` instead of always applying Reverb fees. `eaf()` left untouched — still used as a Reverb-specific display metric across views/modals.
- **Est. Shipping in Add modal:** Optional number field added to add-modal form, HTML, and save logic. Saved to `F.shipping` if filled in — `estProfit()` uses it immediately; blank fields still fall back to $10 placeholder.

### 2026-03-20 (First real order + upside/status cleanup session)
- **#28 bug (P1) — DONE:** MARK SHIPPED ON REVERB button was unresponsive — success set `saveMsg = '✓ buyer notified'` which was filtered out by the error-only span. Also, concurrent `saveShipping()` could overwrite any Reverb error. Fixed by introducing `reverbShipMsg` state separate from `saveMsg`. Button now shows NOTIFYING... → ✓ SHIPPED ON REVERB and disables after success. Errors display in their own span.
- **EasyPost label size:** Added `label_format: 'PDF', label_size: '4X6'` to shipment options in `server/label.js`. Must be set at shipment creation (rates step), not purchase.
- **#29 enhancement (P2) — FILED:** Persist `labelUrl` to Airtable so labels can be reprinted from item modal after the label modal closes.
- **Pending status removed:** "Pending" was never an Airtable status option (actual statuses: Listed, Sold, Prepping). Removed from all status dropdowns, filter pills, `store.pendingRecords` getter, and pipeline chart.
- **EST UPSIDE fixes:** Lot modal `estUpside()`, lots view `estUpside()`, and dashboard `pipeline` now include all non-Sold items (Prepping + Listed) instead of Listed-only.

### 2026-03-19 (Tracking polish + lot modal bug fixes session)
- **#21 enhancement (P2) — DONE:** CLEAR TRACKING button in item modal Shipment section. Clears `trackingId`, `trackingNumber`, `trackerUrl` from Airtable and refreshes store. Validated with test label.
- **#25 bug (P2) — DONE:** Carrier + service name maps in `server/label.js` (`CARRIER_NAMES`, `SERVICE_NAMES`) applied to rates response and `fetchTracker`. In Transit tables fixed: `items-table` (no CSS) → `data-table`, fixed column widths, centered data cells. Delivered items stay visible 3 days via EasyPost delivery event datetime; logic centralized in `store.isInTransit(r, trackingData)`. Note: EasyPost test mode uses historical fake delivery dates so delivered items disappear immediately in test — expected behavior, not a bug.
- **#26 bug (P2) — DONE:** `saveShipping()` now calls `fetchAll()` after the Airtable write so dashboard `_loadTracking()` fires via `$watch` on loading immediately after label purchase.
- **#27 bug (P2) — DONE:** Label modal result screen showed duplicate saved state — button already shows `✓ SAVED`, so `saveMsg` span now only renders on errors.

### 2026-03-19 (Lot modal bug fixes session)
- **#22 bug (P1) — DONE:** Lot modal profit column now shows actual `F.profit` for sold items instead of `estProfit()` (which used list price). Renamed column from "Est Profit" to "Profit". Color class updated to use same value.
- **#24 bug (P2) — DONE:** EAF column in lot modal now shows `—` for sold items — EAF is only meaningful for listed items.
- **#23 bug (P1) — DONE:** Added `previousModal` state to store. Opening an item from lot modal stashes the lot state; close/escape/click-outside on item modal restores lot modal. Guarded lot modal escape handler with `activeModal === 'lot'` check to prevent double-fire.

### 2026-03-18 (Shipment tracking session)
- **#19 enhancement (P1) — DONE (awaiting live label validation):** Full EasyPost tracking feature. New Airtable fields: `trackingId`, `trackingNumber`, `trackerUrl`. New `GET /api/label/tracker/:id` server proxy. `store.fetchTracker(id)` shared helper. `saveShipping()` now saves all 3 tracking fields at purchase. Shipping sidebar button restored (always visible); modal repurposed as "In Transit" panel showing all sold+tracked items with live status badges + Refresh All. Dashboard "In Transit" panel (appears only when items have tracking, hides when all delivered). Items view Sold filter gets a Tracking column. Item modal read view gets a Shipment section with status, carrier, est. delivery, timeline, public tracker link. All 4 surfaces use collect-then-assign pattern to avoid concurrent spread race. Cannot fully validate until next live label purchase populates `trackingId`.

### 2026-03-18 (EasyPost migration session)
- **#18 bug (P2) — DONE:** Implemented EasyPost alongside Shippo with `SHIPPING_PROVIDER` env switch. New `server/label.js` handles `/api/label/*` for both providers. EasyPost weight conversion (lbs→oz), `shipmentId|rateId` encoding in `object_id` (transparent to client). Shippo usage counter preserved, gated to Shippo-only. Shipping sidebar button hidden when on EasyPost (returns for tracking feature). Live EasyPost confirmed working end-to-end in test mode then switched to live.
- **#17 enhancement (P1) — DONE:** Resolved by EasyPost migration — 3000 labels/month, proper sandbox (test labels don't count against quota).
- **#12 bug (P1) — still awaiting real-order validation**

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
