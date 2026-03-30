# Gear Price Comp Research

Quick reference for pulling sold price comps on eBay and Reverb.

Designed as a fast collab workflow with Claude (browser extension) — pull structured comp
data for any piece of gear, then paste the CSV output into Claude Desktop for deal analysis
(pricing, cost basis, feasibility, listing copy, etc.). Much lighter on Desktop's context
than screenshots.

## Output Format

CSV with the following columns:
```
item,source,date_pulled,title,condition,sold_price,shipping,total_landed,sale_type,listing_status,notes
```

- **item** — short name for the gear (e.g. "OWC TB4DOCK")
- **source** — eBay or Reverb
- **date_pulled** — date of the comp pull
- **title** — listing title as shown
- **condition** — as listed (New / Open Box / Mint / Excellent / Very Good / Good / Parts Only / Non-Functioning)
- **sold_price** — final sale price in USD
- **shipping** — shipping cost (0.00 = free)
- **total_landed** — sold_price + shipping (the real comp number — sellers game the split)
- **sale_type** — BIN / Auction / OBO / OBO accepted
- **listing_status** — sold or active
- **notes** — anything notable (price drop, no PSU, lot, serviced, relisted, Japanese import, parts-only, etc.)

Pull at least 8-12 sold comps per item. Below 5 you're guessing.

## Reverb — Sold Listings URL
```
https://reverb.com/marketplace?query=ITEM+NAME&show_only_sold=true&sort=published_at%7Cdesc
```

- `show_only_sold=true` — sold listings only
- `sort=published_at|desc` — most recently sold first
- Remove `show_only_sold=true` for active listings

Watch for duplicate listings on Reverb — slow movers get relisted repeatedly and inflate
the sample. If you see near-identical titles and prices from the same seller, collapse them
to one data point and note "relisted" in the notes column.

**Example:**
```
https://reverb.com/marketplace?query=teac%20a-2300sx&show_only_sold=true&sort=published_at%7Cdesc
```

## eBay — Sold/Completed Listings URL
```
https://www.ebay.com/sch/i.html?_nkw=ITEM+NAME&_sacat=0&LH_Sold=1&LH_Complete=1&_udlo=MIN_PRICE
```

- `LH_Sold=1` + `LH_Complete=1` — sold listings only
- `_udlo=100` — optional minimum price to filter out accessories/parts
- `_sadis=60` — optional: extend to 60-day window (useful for slow-moving or obscure gear)

Note: "completed" does not always mean sold. Listings that expired with no buyer also appear.
Reliable sold signals: price drops accepted, "best offer accepted" label, or a sold date visible
in the listing detail.

Collapse relisted eBay listings too — same seller, identical title and price appearing multiple
times should be normalized to one data point, same as Reverb.

**Example:**
```
https://www.ebay.com/sch/i.html?_nkw=OWC+TB4DOCK&_sacat=0&LH_Sold=1&LH_Complete=1&_udlo=100
```

## Workflow

1. Tell Claude the item name, min price if needed, and any search hints (see below)
2. Claude pulls both platforms and returns a CSV block
3. Paste CSV into Claude Desktop for deal analysis, listing copy, cost basis, etc.

### Search Hints — include these in your handoff when relevant

- **Alternates:** For discontinued or obscure items with thin comp pools, specify acceptable
  alternate models upfront. Claude will pull those at search time rather than discovering the
  gap mid-pull.
  Format: `alternates_ok: [AT8024, PRO 24]`
  Example items that need this: discontinued mics, niche camera accessories, older pedals

- **Variant callouts:** For items with version tiers that meaningfully affect price, specify
  which variant you have. Example: EN-EL15 vs EN-EL15b vs EN-EL15c each trade at different
  price points — tell Claude which one you're researching.

- **Brand-specific model names:** Some brands use internal SKU names that search better than
  generic descriptions. Example: Timbuk2 camera bags — search `timbuk2 snoop` (the
  camera-specific SKU) rather than `timbuk2 messenger` to get camera-configured comps.

- **Battery/accessory searches:** Specify "battery only, no charger" in the item description
  to prevent charger listings from polluting results. Price floors don't cleanly solve this
  since chargers overlap in price with batteries.

- **Kit lens specificity:** For camera kit comps, specify the exact kit lens — 18-105mm and
  55-200mm are different markets with different demand. Generic "D7000 kit" returns mostly
  18-105mm results which may not be comparable.

## Pricing Notes

- `total_landed` is the real comp number — item price alone is misleading when sellers bury cost in shipping
- Reverb fetches higher prices than eBay for music gear
- "Great Value" badge on Reverb = algorithm thinks it's priced well
- Free shipping listings are more competitive on Reverb
- Serviced/recapped units with documentation command a premium
- Watch for lots — normalize to per-unit price
- Condition and completeness (PSU, cables, original box) move the needle significantly
- For fast-moving gear, 30-day recency is fine; for obscure or slow-moving items, use the 60-day window
- **Parts-only listings** are floor data — useful as a floor reference but exclude from working comp analysis
- **Japanese import listings** (AC100V voltage noted) are a known comp artifact — buyer awareness required, flag in notes but treat as a separate tier
- **Auction outliers at the low end** often reflect condition issues not visible in the title — check seller's other listings for clues before including in your range
- **Shutter count matters for cameras** — low SC (<10k) commands a premium tier; mid SC (10k-30k) is the normal market; high SC (50k+) trends toward floor pricing regardless of condition claims
