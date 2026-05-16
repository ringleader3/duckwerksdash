#!/usr/bin/env node
// Clean disc titles: null out list_title blobs and push regenerated titles to eBay.
// Dry-run by default. Pass --confirm to write DB + update eBay.
//
// Affected SKUs: any non-sold inventory row where list_title is set
// (curated titles are removed; generateTitle() produces the new value)

const db      = require('../server/db');
const { getAccessToken } = require('../server/ebay-auth');

const CONFIRM = process.argv.includes('--confirm');
const CACHE_FILE = require('path').join(__dirname, '.clean-disc-titles-cache.json');
const fs = require('fs');

const EBAY_API = 'https://api.ebay.com';

function generateTitle({ manufacturer, mold, plastic, run, weight, color, condition }) {
  const parts = [manufacturer, mold, plastic];
  if (run) parts.push(run);
  parts.push(`${weight}g`, color);
  if (condition === 'USED') parts.push('Used');
  const title = parts.join(' ');
  if (title.length <= 80) return title;
  return title.slice(0, 81).replace(/\s+\S*$/, '');
}

async function pushTitleToEbay(token, offerId, title) {
  // PATCH the inventory item's title via the offer's SKU
  const offerRes = await fetch(`${EBAY_API}/sell/inventory/v1/offer/${offerId}`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  if (!offerRes.ok) throw new Error(`GET offer ${offerId} → ${offerRes.status}`);
  const offer = await offerRes.json();
  const sku = offer.sku;

  const itemRes = await fetch(`${EBAY_API}/sell/inventory/v1/inventory_item/${sku}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!itemRes.ok) throw new Error(`GET inventory_item ${sku} → ${itemRes.status}`);
  const item = await itemRes.json();

  item.product.title = title;

  const putRes = await fetch(`${EBAY_API}/sell/inventory/v1/inventory_item/${sku}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(item),
  });
  if (!putRes.ok) {
    const err = await putRes.text();
    throw new Error(`PUT inventory_item ${sku} → ${putRes.status}: ${err}`);
  }
}

async function main() {
  const fetch = (...args) => import('node-fetch').then(m => m.default(...args));
  global.fetch = fetch;

  const rows = db.prepare(`
    SELECT i.sku,
           json_extract(i.metadata, '$.list_title') as list_title,
           i.metadata,
           l.offer_id
    FROM inventory i
    LEFT JOIN listings l ON l.item_id = (
      SELECT id FROM items WHERE sku = i.sku LIMIT 1
    )
    WHERE i.status != 'sold'
      AND json_extract(i.metadata, '$.list_title') IS NOT NULL
    ORDER BY i.sku
  `).all();

  if (rows.length === 0) {
    console.log('No curated list_title entries found.');
    return;
  }

  const plan = rows.map(row => {
    const meta = JSON.parse(row.metadata);
    const newTitle = generateTitle(meta);
    return {
      sku:       row.sku,
      offer_id:  row.offer_id,
      old_title: row.list_title,
      new_title: newTitle,
    };
  });

  if (!CONFIRM) {
    console.log(`DRY RUN — ${plan.length} listings would be updated:\n`);
    plan.forEach(p => {
      console.log(`${p.sku}  [offer: ${p.offer_id || 'none'}]`);
      console.log(`  OLD: ${p.old_title}`);
      console.log(`  NEW: ${p.new_title}`);
    });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(plan, null, 2));
    console.log(`\nCache written to ${CACHE_FILE}`);
    console.log('Re-run with --confirm to apply.');
    return;
  }

  // --confirm: read cache if available, else use fresh plan
  let work = plan;
  if (fs.existsSync(CACHE_FILE)) {
    work = JSON.parse(fs.readFileSync(CACHE_FILE));
    console.log(`Using cached plan (${work.length} entries).`);
  }

  const token = await getAccessToken();
  let dbOk = 0, ebayOk = 0, ebaySkipped = 0, ebayFail = 0;

  for (const p of work) {
    // 1. Null out list_title in DB
    const meta = JSON.parse(db.prepare('SELECT metadata FROM inventory WHERE sku = ?').get(p.sku).metadata);
    delete meta.list_title;
    db.prepare('UPDATE inventory SET metadata = ? WHERE sku = ?')
      .run(JSON.stringify(meta), p.sku);
    dbOk++;

    // 2. Push new title to eBay
    if (!p.offer_id) {
      console.log(`${p.sku}: DB updated, no offer_id — skipping eBay`);
      ebaySkipped++;
      continue;
    }
    try {
      await pushTitleToEbay(token, p.offer_id, p.new_title);
      console.log(`${p.sku}: OK — "${p.new_title}"`);
      ebayOk++;
    } catch (e) {
      console.error(`${p.sku}: eBay FAILED — ${e.message}`);
      ebayFail++;
    }
  }

  fs.unlinkSync(CACHE_FILE);
  console.log(`\nDone. DB: ${dbOk} updated. eBay: ${ebayOk} ok, ${ebaySkipped} skipped (no offer_id), ${ebayFail} failed.`);
}

main().catch(e => { console.error(e); process.exit(1); });
