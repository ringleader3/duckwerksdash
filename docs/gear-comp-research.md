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

---

## Duplicate / Relisted Listings

Watch for duplicate listings — slow movers get relisted repeatedly and inflate the sample. If you see near-identical titles and prices from the same seller, collapse them to one data point and note "relisted" in the notes column. Apply this to both eBay and Reverb results.

On eBay: "completed" does not always mean sold. Listings that expired with no buyer also appear. Reliable sold signals: price drops accepted, "best offer accepted" label, or a sold date visible in the listing detail.

---

## Recency Weighting

Not all sold comps are equal. Apply these tiers:

- **Last 30 days** — full weight; primary working range
- **31-90 days** — valid; flag in notes if market conditions may have shifted (new model release, viral moment, etc.)
- **91-180 days** — reference only; note as stale if used in range calculation
- **180+ days** — floor/ceiling signal only; do not include in working comp range

Adjust window by category:
- **Consumer electronics / gaming** — tightest window (30-day preferred, 60-day max); these markets move fast
- **Vintage music gear / comics / collectible discs** — 90-day window is appropriate; market is slower and thinner
- **Standard resale gear (pedals, interfaces, pro audio)** — 60-day default

---

## Thin Comp Pool Protocol

When the comp pool is under 5 usable sold listings:

- **3-4 comps:** Proceed but flag confidence as moderate. Note the sample size. Widen search terms (remove condition qualifiers, try adjacent variants) and document what you tried.
- **1-2 comps:** Flag confidence as low. Price conservatively at the lower end of what exists unless the item is clearly rare. Note: "Thin market — 2 comps found, pricing conservatively."
- **0 comps:** Do not invent a price from thin air. Price at 60-75% of current retail (new) or at the floor of active listing prices, whichever is lower. Note as "No secondary market data — priced from retail/active ceiling."
- **Rarity exception:** If zero or few comps exist because the item is genuinely rare or limited, support higher pricing conservatively. Low data points from rarity are different from low data points from obscurity. Flag explicitly.

---

## Outlier Protocol

Before including a comp in your working range, ask whether it represents a real secondary market transaction:

**Investigate before including (>2x median):**
- May indicate a bundle, rare variant, exceptional condition, or error
- Check listing detail for clues — if the reason is clear, note it and include; if not, exclude

**Likely floor data (<0.5x median):**
- Usually indicates parts/damage not visible in the title, desperation pricing, or a distressed sale
- Include as floor reference only; do not anchor the working range to it

**Structural outliers to always flag:**
- Auction ending on a weekday morning — low engagement, treat as floor data
- Same seller, same item, multiple "sold" entries at similar prices — shill or relisted artifact, collapse to one point
- "Best offer accepted" with no stated accepted price — treat as somewhere below ask, not a clean comp
- Chinese arbitrage / bulk retail listings appearing as "sold" (language like "pick your weight", "select your color") — these are ongoing retail, not secondary market. Use as price ceiling signal only.

---

## Price Synthesis

After collecting comps, produce a working range and a recommended list price:

1. Remove outliers (document what was removed and why)
2. Calculate floor (10th percentile), midpoint (median), and ceiling (90th percentile) of remaining comps
3. Set **Est. Value** as the realistic range — floor to ceiling, excluding true outliers
4. Set **List Price** as a specific number within that range based on:
   - Condition relative to comps (better condition = higher in range)
   - Recency of comps (older comps = price lower in range to be conservative)
   - Comp pool depth (thin pool = lower in range)
   - Platform (Reverb commands 20-40% premium over eBay on music gear)
5. **Round numbers only.** Never use $.99-style pricing. Round to nearest $5 or $10 depending on price tier.

---

## General Pricing Notes

- `total_landed` is the real comp number — item price alone is misleading when sellers bury cost in shipping
- Free shipping listings are more competitive on Reverb
- Serviced/recapped units with documentation command a premium
- Watch for lots — normalize to per-unit price
- Condition and completeness (PSU, cables, original box) move the needle significantly
- **Parts-only listings** are floor data — useful as a floor reference but exclude from working comp analysis
- **Japanese import listings** (AC100V voltage noted) are a known comp artifact — flag in notes but treat as a separate tier
- **Auction outliers at the low end** often reflect condition issues not visible in the title — check seller's other listings for clues before including in your range
- **Shutter count matters for cameras** — low SC (<10k) commands a premium tier; mid SC (10k-30k) is the normal market; high SC (50k+) trends toward floor pricing regardless of condition claims

---

## Music Gear Pricing Notes

- **Platform spread:** Reverb consistently outperforms eBay by 20-40% on music gear. If comps are eBay-only, note this when recommending Reverb list price — adjust up accordingly.
- **Vintage premium (pre-1990):** Original, unmodified, all-original components command a premium over modded or partially replaced units. "All original" or "matching date codes" in a listing is a signal.
- **Modifications cut value for general buyers.** Exception: well-documented boutique mods (Analogman, Keeley) can add value to the right buyer, but limit the audience. Note mods in the comp if present.
- **Original hard shell case (OHSC):** Adds meaningful value, especially on guitars and vintage synths. Note presence/absence in comps.
- **Service documentation:** Recap, cap kit, or recent service with documentation commands a premium on vintage tube gear, tape machines, and vintage synths. Undocumented service does not.
- **Boss pedals (MIJ vs MIT):** Made in Japan units (pre-~1988 on most models) command a significant collector premium over Made in Taiwan or later production. Always note country of manufacture in the comp if visible.
- **Player vs. collector split:** Some gear (vintage Fender, Gibson, Moog) has a collector buyer who cares about originality and a player buyer who cares about function. These are different markets with different price tolerances. Assess which side is driving the comps.
- **Cosmetic condition on amps and rack gear:** Buyers expect road wear. Cosmetic issues matter less here than on guitars or consumer electronics. Functional condition is primary.

---

## Consumer Electronics Pricing Notes

- **Generation and revision matter — do not comp across them.** A v1 and a v3 of the same product line are different items with different markets. Check model numbers carefully.
- **Firmware/software version:** For pro audio interfaces, DAW controllers, and similar gear, supported firmware versions affect value. A unit stuck on an unsupported firmware tier is worth less.
- **Power supply inclusion is critical** for older gear with proprietary PSUs. A unit without its PSU may be worth half or less. Note presence/absence in every comp.
- **Known failure modes:** Some electronics have documented failure patterns (capacitor plague units 2004-2007, RPTV convergence drift, cracked solder joints on specific models). If the item has a known issue history, flag it — buyers know and price accordingly.
- **Bundle normalization:** If comps include bundles (camera + lens, interface + software bundle), normalize to the standalone value. Do not use bundle comps uncorrected.
- **Original box premium:** Modest on consumer electronics ($5-15); more significant on pro audio and synthesizers where collectors care about it.
- **Cosmetic condition matters more** on consumer electronics than on pro audio rack gear. Scratches and scuffs are more disqualifying to consumer buyers.

---

## Comics Pricing Notes

- **Raw vs. graded (CGC/CBCS) are different markets.** Do not use graded sold comps to price raw copies or vice versa. A CGC 9.8 copy may sell for 5-10x what a raw NM copy sells for. Separate the analyses.
- **First print vs. reprint is the most important single variable.** A first printing and a later reprint of the same issue are different items. First prints command significant premiums on key issues. Verify print run via UPC, indicia, or known identifiers before comp-ing.
- **Newsstand vs. direct edition:** On certain issues and eras (Marvel/DC 1977-1996 primarily), newsstand editions have documented collector premiums due to lower print runs. Flag if relevant.
- **Key issue non-linearity:** A first appearance, first cover, or origin issue does not price linearly with non-key issues from the same series. Key issues have their own comp pool — pull separately.
- **Condition grading scale:** 0.5 (Poor) through 10.0 (Gem Mint). Raw condition is estimated; CGC/CBCS grades are certified. When comping raw copies, use condition language ("VF", "VF/NM", "NM") and note that raw grades carry more variability than slabbed grades.
- **CGC census data:** For high-value issues, low census counts at high grades (e.g., "only 12 copies graded 9.8") can justify premium pricing even with thin comp data. Note census if known.
- **Lot pricing vs. individual issue pricing:** Lot comps and single-issue comps are different pools — do not mix them. When comping a lot, search for lots of similar size and completeness. Normalize any individual-issue comps to per-issue price as a floor reference only, not a working comp.
- **Completeness premium:** A near-complete or complete run commands a meaningful premium over a partial lot of the same series. Flag any gaps in the run being sold (missing issues) and note whether comps are for complete vs. partial runs — this affects where in the range to price.
- **Trade paperback vs. single issue:** These are separate markets even within the same series. Do not comp TPBs against single issues or vice versa. Pull separately.
- **Series-specific thin markets:** Older independent titles (ElfQuest, Strangers in Paradise, early Abstract Studio, Warp Graphics) have small but loyal collector bases. Thin comp pools are normal and do not indicate no market — apply the rarity exception from the Thin Comp Pool Protocol and price at the higher end of what exists.
- **Bagged and boarded condition signal:** "Stored bagged and boarded" or "bagged and sleeved since purchase" is a meaningful condition signal — it indicates the seller was a careful collector, not a casual reader. Factor this into condition assessment and note it if visible in comps.
- **Graphic novels and hardcovers:** Price separately from standard issues and TPBs. Hardcover editions (especially signed, numbered, or with original art) have their own comp pool. Never use a softcover TPB comp to price a hardcover edition of the same title.
- **Publisher context for indie titles:** Small press and independent publishers (WaRP Graphics, Abstract Studio, First Publishing, Dark Horse) did not have the print run scale of Marvel/DC. Surviving copies in good condition are proportionally scarcer. Weight this when the comp pool is thin.

---

## Disc Golf Pricing Notes

- **Plastic tier matters significantly** — premium plastics (Halo, Neutron, Cosmic Neutron, Proton, Eclipse, Fission) command higher prices than base plastics (Poly, Glow). Note the plastic in the comp when relevant.
- **Run and edition premiums** — first runs, limited stamp editions, event stamps, and pro shop exclusives trade at a premium over standard releases. Flag these in notes.
- **Weight ranges** — heavier weights (174g+) are generally preferred for distance drivers; putters and midranges are less weight-sensitive. Significant weight outliers can affect price.
- **Unthrown/mint condition premium** — disc golf buyers pay a notable premium for unthrown discs. Condition claims in the title ("unthrown", "mint", "never thrown") are reliable signals.
- **Prototype and pre-production discs** — command significant premiums, often 2-3x standard release pricing. Always flag in notes.
- **Collector vs. player demand** — some molds (putters especially) have crossover collector demand that inflates prices above functional value. Consider the audience when setting floor/ceiling.
- **OTB and specialty retailer stamps** — store stamps from known retailers add modest premium over generic stamps.
- **Chinese arbitrage / retailer listings as "sold"** — filter these out. Phrases like "pick your weight/color" or "select your weight/color" identify ongoing retail inventory, not secondary market sales. Use as price ceiling reference only.
