# Duckwerks Dashboard — Claude Code Guide

> **Source of truth:** This file is the authoritative reference for all sessions.
> Update it at the end of every session with any structural changes made.

## Project Overview
Personal resale inventory dashboard for Geoff Goss (Duckwerks Music). Tracks disc golf, music gear, comics, and gaming items sold on eBay and Reverb. Built with Alpine.js, served by a local Express server, backed by SQLite.

## Stack
- **Frontend:** `public/v2/` — Alpine.js, modular JS files, no build step
- **Backend:** `server.js` — local Express server (Node 22), proxies all API calls
- **Database:** SQLite via `better-sqlite3` — `data/duckwerks.db`
- **Shipping:** EasyPost API (active); Shippo retained but inactive. Provider via `SHIPPING_PROVIDER` in `.env`
- **Config:** `.env` — never commit, never read client-side

## Running Locally
```bash
npm start   # starts Express on http://localhost:3000
```

## Specs & Plans
- `docs/superpowers/specs/` — design specs (source of truth for "why")
- `docs/superpowers/plans/` — implementation plans
- `.superpowers/` — brainstorm working files (gitignored)

## Version Control
- GitHub: https://github.com/ringleader3/duckwerksdash (private)
- Commit after any meaningful session of changes
- Never commit `.env`, `node_modules/`, `*.pdf`, `test.html`, `comic-reselling-project.md`, `data/duckwerks.db`

## Dev vs Production

> **Every commit must be followed immediately by `git push origin main` and `bash scripts/deploy-nuc.sh`. A commit alone is invisible to Geoff. Do not tell Geoff to check anything until deploy-nuc.sh has confirmed the restart.**

- **Default: ship to production.** Fix it, commit, push, deploy, tell Geoff to refresh `dash.duckwerks.com`. That is the normal flow for every bug fix, tweak, and feature.
- **Local dev only for huge projects** — multi-session rewrites, schema migrations, new API integrations. In those cases: use `localhost:3000` (`npm start`), commit less, hold pushes until a natural milestone.
- **Never tell Geoff to refresh `localhost:3000`** unless you're explicitly in a local dev session together.
- **Deploying:** push to origin, then `bash scripts/deploy-nuc.sh`.

---

## Key Files

**Server**
- `server.js` — Express entry point: mounts routers, serves static, redirects `/` → `/v2`
- `server/db.js` — opens SQLite db via better-sqlite3; shared across all routers
- `server/catalog.js` — `/api/sites`, `/api/categories`
- `server/catalog-intake.js` — `/api/catalog-intake/*` — Google Sheets backend; key at `docs/handicaps-244e5d936e6c.json`
- `server/items.js` — `/api/items` CRUD
- `server/lots.js` — `/api/lots` CRUD
- `server/listings.js` — `/api/listings` CRUD
- `server/orders.js` — `/api/orders` CRUD
- `server/shipments.js` — `/api/shipments` CRUD
- `server/label.js` — provider-agnostic label routes (`/api/label/*`)
- `server/print.js` — label print proxy (`POST /api/print/label`) → forwards to `PRINT_SERVER_URL`
- `server/comps.js` — comp research (`/api/comps/*`) — SerpAPI + Puppeteer + Claude
- `server/reverb.js` — Reverb proxy (`/api/reverb/*`)
- `server/ebay-auth.js` — eBay OAuth (one-time setup + auto-refresh)
- `server/ebay.js` — eBay Sell Fulfillment (`/api/ebay/*`)
- `server/ebay-listings.js` — eBay Inventory API bulk listing (`POST /api/ebay/bulk-list`)
- `scripts/bulk-list-discs.js` — bulk eBay lister; idempotent (safe to re-run)
- `scripts/backfill-skus.js` — one-time SKU backfill from eBay Inventory API; dry-run by default, `--confirm` to write
- `data/ebay-tokens.json` — eBay OAuth tokens (never commit)

**Frontend**
- `public/v2/index.html` — app shell with `<!-- partial: views/foo -->` and `<!-- partial: modals/foo -->` comment placeholders; server assembles the final HTML at request time by inlining partials (see `server.js` `assembleHTML()`)
- `public/v2/partials/views/` — view HTML partials (dashboard, items, lots, analytics, comps, catalog, sites)
- `public/v2/partials/modals/` — modal HTML partials (item, add, lot, label, shipping)
- `public/v2/js/config.js` — constants: `CAT_BADGE`, `CAT_COLOR`, `SITE_FEES`, `APP_VERSION`
- `public/v2/js/store.js` — `Alpine.store('dw')` — all data, helpers, modal state
- `public/v2/js/sidebar.js` — search + nav state
- `public/v2/js/views/` — Alpine component definitions for each view
- `public/v2/js/modals/` — Alpine component definitions for each modal (item, add, lot, label, shipping)

> Full endpoint docs + env vars + schema: `docs/claude/api-reference.md`
> Alpine architecture, modal patterns, component details: `docs/claude/frontend-reference.md`

---

## Working on Files
- JS files under ~150 lines: read in full. Larger: grep first, targeted read only.
- `index.html` is a short shell (~235 lines) — safe to read in full. Edit view/modal content in the partials, not the shell.
- Surgical edits (str_replace). One logical change per edit.
- Never guess at API shapes — ask for the spec or docs before writing any call.

## Scripts (`scripts/`)
- Default to dry-run; require `--confirm` to write (not `--apply`)
- Dry-run caches results to a local JSON file; `--confirm` reads the cache and applies — no second API round trip
- If no cache exists when `--confirm` is passed, fetch fresh and apply in one shot
- Use `AND col IS NULL` (or equivalent) on UPDATE statements to make writes idempotent

## Gotchas

**Alpine modal pattern** — every modal overlay needs three things on its root div or it will be permanently visible and break the entire UI:
```html
<div x-show="$store.dw.activeModal === 'modal-name'" x-data="modalComponent" class="modal-overlay" x-cloak>
```
And the JS component needs an `init()` that `$watch`es `activeModal` to call `reset()` on open:
```js
init() {
  this.$watch('$store.dw.activeModal', val => { if (val === 'modal-name') this.reset(); });
},
```

---

## When to Use Superpowers Workflow

| Signal | Approach |
|---|---|
| Single file, obvious change | Just do it |
| Known bug, root cause clear | Just do it |
| UI tweak (font, color, layout) | Just do it |
| Clear requirements, 2–3 files | Just do it |
| Ticket already has impl notes | Just do it |
| New data flow or API integration | Brainstorm → spec → build |
| Multiple files with shared state | Brainstorm → spec → build |
| Requirements fuzzy or design unclear | Brainstorm → spec → build |
| Multi-session work, or >5 files with non-obvious sequencing | Brainstorm → spec → written plan → build |

**"Brainstorm → spec → build"** means: align on design, write the spec, then implement directly in-session without a written task plan. The spec is the artifact; the plan is overhead unless the work spans sessions or has tricky sequencing.

---

## Versioning
- `public/v2/js/config.js` → `APP_VERSION` constant (shown in sidebar)
- `package.json` → `version` field
- Bump patch at end of every session that ships something.
- Tag minor/major versions only — no tags per patch.

---

## Session Start
1. Read `CLAUDE.md` (this file)
2. React to Geoff's opening prompt — don't pre-fetch issues or run diagnostics unless asked

## Checkpoint Protocol
Any time Geoff says "checkpoint":
1. Bump patch version in `config.js` + `package.json`
2. Update `docs/session-log.md`
3. Commit with ticket refs
4. Push to origin
5. Run `bash scripts/deploy-nuc.sh` to deploy to production

## Session Close
At the end of every session:
1. Bump patch version in `config.js` + `package.json` (if anything shipped)
2. Update `CLAUDE.md` with any structural changes made this session
3. Update `docs/session-log.md`
4. Save any useful memories (new patterns, decisions, persistent context) to the memory system
5. Commit all changes including docs with ticket refs
6. Push to origin
7. Run `bash scripts/deploy-nuc.sh`

Tell Geoff what was updated in CLAUDE.md, session-log.md, and memory — one line each.

---

## Bug & Enhancement Tracking
GitHub Issues on `ringleader3/duckwerksdash`.
- **Reference issues in commits** with `ref #N` — never `fix #N` or `closes #N` (auto-closes)
- **Never close issues** — only Geoff closes after confirming in browser
- Work P1 bugs → P1 enhancements → P2s
- For features needing live validation: close impl ticket when confirmed, open follow-up `test` ticket

---

## Session Log
Full log: [`docs/session-log.md`](docs/session-log.md) — update at end of every session.