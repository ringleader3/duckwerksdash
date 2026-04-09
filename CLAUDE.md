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
- `data/ebay-tokens.json` — eBay OAuth tokens (never commit)

**Frontend**
- `public/v2/index.html` — app shell (never read in full — always grep first)
- `public/v2/js/config.js` — constants: `CAT_BADGE`, `CAT_COLOR`, `SITE_FEES`, `APP_VERSION`
- `public/v2/js/store.js` — `Alpine.store('dw')` — all data, helpers, modal state
- `public/v2/js/sidebar.js` — search + nav state
- `public/v2/js/views/` — dashboard, items, lots, analytics, comps, catalog
- `public/v2/js/modals/` — item, add, lot, label, reverb, ebay

> Full endpoint docs + env vars + schema: `docs/claude/api-reference.md`
> Alpine architecture, modal patterns, component details: `docs/claude/frontend-reference.md`

---

## Working on Files
- JS files under ~150 lines: read in full. Larger: grep first, targeted read only.
- `index.html` exceeds 300 lines — always grep first, never read in full.
- Surgical edits (str_replace). One logical change per edit.

---

## When to Use Superpowers Workflow

| Signal | Approach |
|---|---|
| Single file, obvious change | Just do it |
| Known bug, root cause clear | Just do it |
| UI tweak (font, color, layout) | Just do it |
| Clear requirements, 2–3 files | Plan only — skip brainstorm |
| Ticket already has impl notes | Plan only — skip brainstorm |
| New data flow or API integration | Full workflow |
| Multiple files with shared state | Full workflow |
| Requirements fuzzy or design unclear | Full workflow |

---

## Versioning
- `public/v2/js/config.js` → `APP_VERSION` constant (shown in sidebar)
- `package.json` → `version` field
- Bump patch at end of every session that ships something.
- Tag minor/major versions only — no tags per patch.

---

## Session Start Checklist
1. Read `CLAUDE.md` (this file)
2. Run `gh issue list --state open`
3. Work P1 bugs first, then P1 enhancements, then P2s

## Checkpoint Protocol
Any time Geoff says "checkpoint":
1. Bump patch version in `config.js` + `package.json`
2. Update `docs/session-log.md`
3. Commit with ticket refs
4. Push to origin

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
