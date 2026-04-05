# Gear Price Comp Research — Analysis Reference

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

## Duplicate / Relisted Listings

Watch for duplicate listings — slow movers get relisted repeatedly and inflate the sample. If you see near-identical titles and prices from the same seller, collapse them to one data point and note "relisted" in the notes column. Apply this to both eBay and Reverb results.

On eBay: "completed" does not always mean sold. Listings that expired with no buyer also appear. Reliable sold signals: price drops accepted, "best offer accepted" label, or a sold date visible in the listing detail.

## Pricing Notes

- `total_landed` is the real comp number — item price alone is misleading when sellers bury cost in shipping
- Reverb fetches higher prices than eBay for music gear
- Free shipping listings are more competitive on Reverb
- Serviced/recapped units with documentation command a premium
- Watch for lots — normalize to per-unit price
- Condition and completeness (PSU, cables, original box) move the needle significantly
- For fast-moving gear, 30-day recency is fine; for obscure or slow-moving items, use the 60-day window
- **Parts-only listings** are floor data — useful as a floor reference but exclude from working comp analysis
- **Japanese import listings** (AC100V voltage noted) are a known comp artifact — flag in notes but treat as a separate tier
- **Auction outliers at the low end** often reflect condition issues not visible in the title — check seller's other listings for clues before including in your range
- **Shutter count matters for cameras** — low SC (<10k) commands a premium tier; mid SC (10k-30k) is the normal market; high SC (50k+) trends toward floor pricing regardless of condition claims

## Disc Golf Pricing Notes

- **Plastic tier matters significantly** — premium plastics (Halo, Neutron, Cosmic Neutron, Proton, Eclipse, Fission) command higher prices than base plastics (Poly, Glow). Note the plastic in the comp when relevant.
- **Run and edition premiums** — first runs, limited stamp editions, event stamps, and pro shop exclusives trade at a premium over standard releases. Flag these in notes.
- **Weight ranges** — heavier weights (174g+) are generally preferred for distance drivers; putters and midranges are less weight-sensitive. Significant weight outliers can affect price.
- **Unthrown/mint condition premium** — disc golf buyers pay a notable premium for unthrown discs. Condition claims in the title ("unthrown", "mint", "never thrown") are reliable signals.
- **Prototype and pre-production discs** — command significant premiums, often 2-3x standard release pricing. Always flag in notes.
- **Collector vs. player demand** — some molds (putters especially) have crossover collector demand that inflates prices above functional value. Consider the audience when setting floor/ceiling.
- **OTB (Off the Beaten Path) and specialty retailer stamps** — store stamps from known retailers add modest premium over generic stamps.
