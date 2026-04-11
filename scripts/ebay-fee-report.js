#!/usr/bin/env node
// scripts/ebay-fee-report.js
// Updates eBay FVF rate in the local DB and reports forecasted net impact
// of a rate change on currently listed unsold Disc Golf items.
//
// Usage:
//   node scripts/ebay-fee-report.js           # dry-run — shows report, no DB change
//   node scripts/ebay-fee-report.js --confirm  # also updates eBay fee_rate in DB

const path     = require('path');
const Database = require('better-sqlite3');

const CONFIRM      = process.argv.includes('--confirm');
const DB_PATH      = path.join(__dirname, '../data/duckwerks.db');
const NEW_RATE     = 0.136;
const COMPARE_RATE = 0.127;
const FLAT_FEE     = 0.40;

const db = new Database(DB_PATH);

// ── Current fee rate ──────────────────────────────────────────────────────────

const site = db.prepare("SELECT * FROM sites WHERE name = 'eBay'").get();
if (!site) { console.error('eBay site not found in DB'); process.exit(1); }

console.log(`\nCurrent eBay fee rate in DB: ${(site.fee_rate * 100).toFixed(2)}% + $${site.fee_flat.toFixed(2)} flat`);
console.log(`Updating to:                 ${(NEW_RATE * 100).toFixed(2)}% + $${FLAT_FEE.toFixed(2)} flat`);

// ── Listed unsold Disc Golf items ─────────────────────────────────────────────

const rows = db.prepare(`
  SELECT l.list_price
  FROM listings l
  JOIN items i ON l.item_id = i.id
  JOIN categories c ON i.category_id = c.id
  JOIN sites s ON l.site_id = s.id
  WHERE s.name = 'eBay'
    AND i.status = 'Listed'
    AND c.name = 'Disc Golf'
`).all();

const count      = rows.length;
const totalPrice = rows.reduce((sum, r) => sum + r.list_price, 0);
const feesAt136  = totalPrice * NEW_RATE     + count * FLAT_FEE;
const feesAt127  = totalPrice * COMPARE_RATE + count * FLAT_FEE;
const savings    = feesAt136 - feesAt127;

console.log(`\n── Forecasted impact across ${count} listed unsold Disc Golf items ─────────`);
console.log(`Total list price:            $${totalPrice.toFixed(2)}`);
console.log(`Fees at ${(NEW_RATE * 100).toFixed(1)}% + $0.40 flat:   $${feesAt136.toFixed(2)}`);
console.log(`Fees at ${(COMPARE_RATE * 100).toFixed(1)}% + $0.40 flat:   $${feesAt127.toFixed(2)}`);
console.log(`Difference (12.7% saves):    $${savings.toFixed(2)}`);

// ── DB update ─────────────────────────────────────────────────────────────────

if (CONFIRM) {
  db.prepare("UPDATE sites SET fee_rate = ?, fee_flat = ? WHERE name = 'eBay'").run(NEW_RATE, FLAT_FEE);
  console.log(`\nDB updated — eBay fee_rate set to ${NEW_RATE}`);
} else {
  console.log(`\nDry run — pass --confirm to update DB`);
}
