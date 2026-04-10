#!/usr/bin/env node
// scripts/backfill-skus.js
// One-time script: adds sku column (if needed) and backfills SKUs from eBay Inventory API.
//
// Usage:
//   node scripts/backfill-skus.js           # dry-run — shows what would be written
//   node scripts/backfill-skus.js --confirm  # writes to DB

const path     = require('path');
const Database = require('better-sqlite3');
const { getAccessToken } = require('../server/ebay-auth');

const CONFIRM     = process.argv.includes('--confirm');
const EBAY_API    = 'https://api.ebay.com';
const MARKETPLACE = 'EBAY_US';
const DB_PATH     = path.join(__dirname, '../data/duckwerks.db');

async function main() {
  const db = new Database(DB_PATH);

  // ── 1. Ensure sku column exists ──────────────────────────────────────────────
  try {
    db.exec('ALTER TABLE items ADD COLUMN sku TEXT');
    console.log('Added sku column to items table.');
  } catch (e) {
    if (e.message.includes('duplicate column name')) {
      console.log('sku column already exists — skipping ALTER TABLE.');
    } else {
      throw e;
    }
  }

  // ── 2. Fetch all offers from eBay (paginated) ────────────────────────────────
  const token = await getAccessToken();
  const headers = {
    'Authorization':            `Bearer ${token}`,
    'Content-Type':             'application/json',
    'Content-Language':         'en-US',
    'X-EBAY-C-MARKETPLACE-ID':  MARKETPLACE,
    'Accept-Language':          'en-US',
  };

  const offers = [];
  let offset = 0;
  const limit = 200;

  while (true) {
    const res  = await fetch(`${EBAY_API}/sell/inventory/v1/offer?limit=${limit}&offset=${offset}`, { headers });
    const data = await res.json();
    if (!res.ok) throw new Error(`eBay offer fetch failed: ${JSON.stringify(data)}`);
    const page = data.offers || [];
    offers.push(...page);
    if (offers.length >= (data.total || 0) || page.length < limit) break;
    offset += limit;
  }

  console.log(`\neBay returned ${offers.length} offers.`);

  // ── 3. Build sku → listingId map from offers ─────────────────────────────────
  const skuToListingId = {};
  for (const offer of offers) {
    const listingId = offer.listing?.listingId;
    if (offer.sku && listingId) skuToListingId[offer.sku] = String(listingId);
  }

  // ── 4. Match to local DB and collect updates ──────────────────────────────────
  const updates        = [];  // { itemId, sku }
  const noLocalListing = [];  // eBay SKUs with no local listing match

  for (const [sku, listingId] of Object.entries(skuToListingId)) {
    const listing = db.prepare(
      'SELECT item_id FROM listings WHERE platform_listing_id = ?'
    ).get(listingId);

    if (!listing) {
      noLocalListing.push({ sku, listingId });
      continue;
    }

    const item = db.prepare('SELECT id, sku FROM items WHERE id = ?').get(listing.item_id);
    if (!item) continue;

    if (item.sku) {
      console.log(`  skip  ${sku}  → item #${item.id} already has sku=${item.sku}`);
      continue;
    }

    updates.push({ itemId: item.id, sku });
  }

  // ── 5. Report planned updates ─────────────────────────────────────────────────
  console.log(`\n── Would write ${updates.length} SKUs ─────────────────────────────────`);
  for (const { itemId, sku } of updates) {
    console.log(`  item #${itemId}  ←  ${sku}`);
  }

  // ── 6. Report eBay SKUs with no local listing ─────────────────────────────────
  if (noLocalListing.length) {
    console.log(`\n── eBay offers with no local listing match (${noLocalListing.length}) ─────`);
    for (const { sku, listingId } of noLocalListing) {
      console.log(`  ${sku}  listingId=${listingId}`);
    }
  }

  // ── 7. Report local DG items still without a SKU after this run ───────────────
  const dgItems = db.prepare(`
    SELECT i.id, i.name FROM items i
    JOIN categories c ON i.category_id = c.id
    WHERE c.name = 'Disc Golf' AND i.sku IS NULL
  `).all();

  const willBeFixed   = new Set(updates.map(u => u.itemId));
  const stillMissing  = dgItems.filter(i => !willBeFixed.has(i.id));

  if (stillMissing.length) {
    console.log(`\n── Local DG items with no SKU after this run (${stillMissing.length}) ──────`);
    for (const item of stillMissing) {
      console.log(`  item #${item.id}  "${item.name}"`);
    }
  }

  // ── 8. Apply if --confirm ─────────────────────────────────────────────────────
  if (!CONFIRM) {
    console.log('\nDry-run complete. Pass --confirm to write to DB.');
    return;
  }

  const updateStmt = db.prepare('UPDATE items SET sku = ? WHERE id = ? AND sku IS NULL');
  const applyAll   = db.transaction(() => {
    for (const { itemId, sku } of updates) updateStmt.run(sku, itemId);
  });
  applyAll();
  console.log(`\nWrote ${updates.length} SKUs to DB.`);
}

main().catch(e => { console.error(e.message); process.exit(1); });
