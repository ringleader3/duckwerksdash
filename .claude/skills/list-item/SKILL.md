---
name: list-item
description: Use when listing a single item for sale on eBay — walks through intake, gap analysis, comp search terms, comp analysis, pricing, listing copy, and metadata in a linear phase-gated flow with checkpoint files for resuming sessions.
---

# list-item

A linear workflow for taking a single item from "I have this thing" to a ready-to-post eBay listing. One invocation = one item. Checkpoint files allow resuming mid-session.

## Style and Pricing Rules

Load these two files at the start of every session — they govern all copy and pricing decisions:

- `docs/listing-style.md` — title format, description structure, free shipping paragraph (verbatim), "Sold As Is." rule, no em-dashes, round numbers
- `docs/gear-comp-research.md` — comp analysis rules, category-specific pricing notes (comics, music gear, disc golf, electronics)

**Read both files before Phase 1.**

## Checkpoint Files

**Location:** `tmp/listing-sessions/<slug>.json`
**Slug:** kebab-case item name (e.g. `elfquest-hidden-years.json`)

On invocation: check `tmp/listing-sessions/` for an existing checkpoint. If found, skip to the first phase where `done: false`. If not found, start at Phase 1 and create it.

You can hand-craft a checkpoint to jump ahead — populate earlier phases as `done: true` with their data and the skill picks up from the first incomplete phase.

```json
{
  "item_name": "",
  "slug": "",
  "created": "",
  "phases": {
    "intake":       { "done": false, "data": null },
    "gap_analysis": { "done": false, "data": null },
    "comp_terms":   { "done": false, "data": null },
    "comp_data":    { "done": false, "data": null },
    "pricing":      { "done": false, "data": null },
    "copy":         { "done": false, "data": null },
    "metadata":     { "done": false, "data": null },
    "listing":      { "done": false, "data": null }
  }
}
```

Write the checkpoint after each completed phase.

## Phase Flow

### Phase 1 — Intake
Ask: what are you selling? Collect:
- Item name / description (what it is, condition, known details)
- Category (infer if obvious, ask if not)
- Quantity / lot size if applicable
- Anything already known about price

Create checkpoint. Proceed.

### Phase 2 — Gap Analysis
Based on intake + category, assess what you know vs. what you need:
- Shipping method norms for the category
- Typical eBay item specifics / aspects required
- Any category-specific pricing factors from `gear-comp-research.md`

If gaps exist, ask 1-2 targeted questions. Do NOT open-ended web search.

Output a brief "here's what I know, here's what I'm assuming" summary and confirm before proceeding.

> **TODO:** call `GET http://fedora.local:3000/api/ebay/aspects?category=X` to pull required item specifics automatically.

### Phase 3 — Comp Search Terms
Propose 2-3 eBay search term variants. Explain the tradeoffs (broad vs. specific). You confirm or edit.

Output: the exact search string(s) to use.

> **TODO:** call `POST http://fedora.local:3000/api/comps/search` to pull comps automatically and skip the manual dashboard step.

### Phase 4 — Comp Data
Tell the user exactly what to do:

> "Go to http://fedora.local:3000 → COMP tab → search for [terms] → download CSV → paste it here."

Wait for the pasted CSV. Save to checkpoint. Proceed.

> **TODO:** once Phase 3 is automated, this phase collapses — comp data arrives automatically.

### Phase 5 — Pricing
Analyze the comp CSV using `docs/gear-comp-research.md` rules. Output:
- Comp range: floor / midpoint / ceiling
- Recommended list price with rationale
- Confidence level (thin pool, stale comps, etc.)

User confirms or overrides. Save confirmed price to checkpoint.

### Phase 6 — Copy
Write using `docs/listing-style.md` rules:
- eBay title (80-char max)
- Description (story intro → specs → free shipping paragraph → "Sold As Is.")
- Condition field

Present for review. Loop on edit requests within this phase before proceeding.

### Phase 7 — Metadata
Produce the full eBay listing metadata block:
- Category ID
- Condition value (eBay-valid)
- Item specifics / aspects
- Shipping method and handling time
- Return policy
- Duration: GTC
- Min offer %: 75% default

> **TODO:** validate required aspects against live eBay category data via `GET http://fedora.local:3000/api/ebay/aspects`.

### Phase 8 — Listing
Present final review: title, price, condition, key metadata, description preview.

User approves.

Output a **ready-to-list block** with everything formatted for manual eBay entry.

> **TODO:** on approval, call `POST http://fedora.local:3000/api/ebay/bulk-list` (or a new general-purpose listing endpoint) to post directly. The current bulk-list route is disc-specific — a general endpoint needs to be built first.

## All API Calls Use

```
http://fedora.local:3000
```

Local network only. NUC must be reachable. Do not use `dash.duckwerks.com` for POST calls — blocked by Cloudflare Zero Trust from MBA.
