#!/usr/bin/env node
// scripts/ebay-fee-report.js
// Updates site fee rates in the local DB.
//
// Usage:
//   node scripts/ebay-fee-report.js           # dry-run — shows current rates
//   node scripts/ebay-fee-report.js --confirm  # applies updates

const path     = require('path');
const Database = require('better-sqlite3');

const CONFIRM  = process.argv.includes('--confirm');
const DB_PATH  = path.join(__dirname, '../data/duckwerks.db');

const UPDATES = [
  { name: 'eBay', fee_rate: 0.136, fee_flat: 0.40, fee_on_shipping: 1 },
];

const db = new Database(DB_PATH);
const sites = db.prepare("SELECT * FROM sites").all();

console.log('\nCurrent site fee rates:');
sites.forEach(s => {
  console.log(`  ${s.name.padEnd(12)} ${(s.fee_rate * 100).toFixed(2)}% + $${s.fee_flat.toFixed(2)} flat  (on_shipping: ${s.fee_on_shipping})`);
});

if (CONFIRM) {
  const stmt = db.prepare("UPDATE sites SET fee_rate = ?, fee_flat = ?, fee_on_shipping = ? WHERE name = ?");
  UPDATES.forEach(u => {
    stmt.run(u.fee_rate, u.fee_flat, u.fee_on_shipping, u.name);
    console.log(`\nUpdated ${u.name}: ${(u.fee_rate * 100).toFixed(2)}% + $${u.fee_flat.toFixed(2)} flat`);
  });
} else {
  console.log('\nPending updates:');
  UPDATES.forEach(u => {
    console.log(`  ${u.name.padEnd(12)} → ${(u.fee_rate * 100).toFixed(2)}% + $${u.fee_flat.toFixed(2)} flat`);
  });
  console.log('\nDry run — pass --confirm to apply');
}
