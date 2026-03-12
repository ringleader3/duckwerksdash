# Duckwerks Dashboard — Claude Code Guide

## Project Overview
Personal resale inventory dashboard for Geoff Goss (Duckwerks Music). Tracks music gear, comics, and gaming items sold on eBay and Reverb. Built as a single HTML file backed by Airtable, now served by a local Express proxy.

---

## Stack
- **Frontend:** `duckwerks-dashboard.html` — single-file vanilla JS/HTML/CSS app (~2000 lines)
- **Backend:** `server.js` — local Express server (Node 22), serves the HTML and proxies Shippo API calls
- **Database:** Airtable (REST API, called directly from the browser)
- **Shipping:** Shippo API (proxied through Express — cannot be called from browser directly)
- **Config:** `.env` file — never commit, never read client-side

## Running Locally
```bash
npm start   # starts Express on http://localhost:3000
```
Open: `http://localhost:3000/duckwerks-dashboard.html`

---

## Key Files
- `duckwerks-dashboard.html` — the entire frontend
- `server.js` — Express proxy server
- `.env` — secrets (Shippo tokens, from-address)
- `duckwerks_dashboard_architecture.md` — detailed frontend architecture reference
- `package.json` / `node_modules/` — Express + dotenv

---

## Working on the HTML File

**The HTML file is ~2000 lines. Never read it in full.**

Always use Grep to find line numbers first, then Read only the relevant section (±30 lines). Make surgical edits with Edit. Never regenerate the whole file.

```
Grep → find line numbers
Read offset+limit → read only that section
Edit → surgical str_replace
```

Bump `VERSION` in the HTML config section on any structural change.
Update `duckwerks_dashboard_architecture.md` if any function, state var, view, CSS class, or data field is added/removed/renamed.

---

## Environment Variables (.env)
```
SHIPPO_TEST_TOKEN=shippo_test_...
SHIPPO_LIVE_TOKEN=                  # blank until live key obtained
FROM_NAME=Geoff Goss, Duckwerks Music
FROM_STREET1=...
FROM_CITY=San Francisco
FROM_STATE=CA
FROM_ZIP=...
FROM_COUNTRY=US
FROM_PHONE=...
```

## Shippo Test vs Live
- `SHIPPO_TEST_MODE = true/false` constant at top of HTML script block
- Flip to `false` + add `SHIPPO_LIVE_TOKEN` when going live
- Test transactions visible at goshippo.com under Test Mode toggle

---

## server.js API Endpoints
- `POST /api/label/rates` — create Shippo shipment, return sorted rates. Body: `{ testMode, toAddress, parcel }`
- `POST /api/label/purchase` — purchase a rate, return tracking + label URL. Body: `{ testMode, rateObjectId }`
- `POST /api/shippo/:path` — generic Shippo proxy (POST). Body: `{ testMode, ...shippoPayload }`
- `GET /api/shippo/:path` — generic Shippo proxy (GET). Query: `?testMode=true`
- Static file serving: all files in project root served at `/`

From-address is injected server-side from `.env` — never exposed to the browser.

---

## Airtable
- Called directly from the browser (has CORS headers, unlike Shippo)
- `BASE_ID`, `TABLE_ID`, and `TOKEN` are in the HTML `<script>` block (known limitation)
- Field IDs in the `F` object — always use field IDs, not names

---

## User Preferences
- Geoff is comfortable with Node/Express
- Keep it simple — this is a personal tool, not a product
- No unnecessary abstractions or future-proofing
- Dark theme, monospace font (`Space Mono`), `Bebas Neue` for large numbers
- Yellow = estimate/pending, Green = actual/positive, Red = cost/negative, Blue = action
