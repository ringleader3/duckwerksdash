#!/usr/bin/env node
// Migrates existing eBay listings to Inventory API model.
// Pass 1: listings with no SKU → bulk_migrate_listing → write sku + offer_id
// Pass 2: listings with SKU but no offer_id → GET /offer → write offer_id
// Default: dry run. Pass --confirm to apply changes.

const Database = require('better-sqlite3');
const path     = require('path');

const CONFIRM  = process.argv.includes('--confirm');
const BASE_URL = process.env.BASE_URL || 'http://fedora.local:3000';
const DB_PATH  = path.join(__dirname, '../data/duckwerks.db');

const db = new Database(DB_PATH);

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function pass1() {
  console.log('\n=== Pass 1: migrate listings with no SKU ===');
  const rows = db.prepare(
    `SELECT l.id, l.platform_listing_id
     FROM listings l
     JOIN sites s ON s.id = l.site_id
     WHERE s.name = 'eBay'
       AND l.platform_listing_id IS NOT NULL
       AND l.sku IS NULL`
  ).all();

  if (!rows.length) { console.log('Nothing to migrate.'); return; }
  console.log(`Found ${rows.length} listing(s) to migrate.`);

  const chunks = chunk(rows, 5);
  let migrated = 0, errors = 0;

  for (const batch of chunks) {
    const listingIds = batch.map(r => r.platform_listing_id);
    const res = await fetch(`${BASE_URL}/api/ebay/migrate-listing`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ listingIds }),
    });
    if (!res.ok) {
      console.error(`  batch failed HTTP ${res.status}:`, await res.text());
      errors += batch.length;
      continue;
    }
    const results = await res.json();
    for (const result of results) {
      const row = batch.find(r => r.platform_listing_id === result.listingId);
      if (!row) continue;
      if (result.error) {
        console.log(`  SKIP  listing ${result.listingId}: ${result.error}`);
        errors++;
      } else {
        console.log(`  ${CONFIRM ? 'WRITE' : 'DRY'} listing ${result.listingId} → sku=${result.sku} offer_id=${result.offerId}`);
        if (CONFIRM) {
          db.prepare('UPDATE listings SET sku = ?, offer_id = ? WHERE id = ? AND sku IS NULL')
            .run(result.sku, result.offerId, row.id);
        }
        migrated++;
      }
    }
  }
  console.log(`Pass 1 complete: ${migrated} migrated, ${errors} errors.`);
}

async function pass2() {
  console.log('\n=== Pass 2: backfill offer_id for listings with SKU but no offer_id ===');
  const rows = db.prepare(
    `SELECT l.id, l.sku
     FROM listings l
     JOIN sites s ON s.id = l.site_id
     WHERE s.name = 'eBay'
       AND l.sku IS NOT NULL
       AND l.offer_id IS NULL`
  ).all();

  if (!rows.length) { console.log('Nothing to backfill.'); return; }
  console.log(`Found ${rows.length} listing(s) to backfill.`);

  let filled = 0, missing = 0, errors = 0;

  for (const row of rows) {
    const res = await fetch(`${BASE_URL}/api/ebay/offer?sku=${encodeURIComponent(row.sku)}`);
    if (!res.ok) {
      console.error(`  ERROR sku=${row.sku} HTTP ${res.status}`);
      errors++;
      continue;
    }
    const { offerId } = await res.json();
    if (!offerId) {
      console.log(`  MISS  sku=${row.sku} → no offer found`);
      missing++;
    } else {
      console.log(`  ${CONFIRM ? 'WRITE' : 'DRY'} sku=${row.sku} → offer_id=${offerId}`);
      if (CONFIRM) {
        db.prepare('UPDATE listings SET offer_id = ? WHERE id = ? AND offer_id IS NULL').run(offerId, row.id);
      }
      filled++;
    }
  }
  console.log(`Pass 2 complete: ${filled} filled, ${missing} not found, ${errors} errors.`);
}

async function main() {
  console.log(`Mode: ${CONFIRM ? 'CONFIRM (writing changes)' : 'DRY RUN (no changes written)'}`);
  console.log(`Server: ${BASE_URL}`);
  await pass1();
  await pass2();
  console.log('\nDone.');
  db.close();
}

main().catch(e => { console.error(e); process.exit(1); });
