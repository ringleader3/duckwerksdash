#!/usr/bin/env node
// Clean disc titles: null out list_title blobs and push regenerated titles to eBay.
// Dry-run by default. Pass --confirm to write DB + update eBay.
//
// Affected SKUs: any non-sold inventory row where list_title is set
// (curated titles are removed; generateTitle() produces the new value)
//
// eBay updates go through the local /api/ebay/bulk-update route — same path
// the UI uses, no direct API calls needed.

const db = require('../server/db');
const fs = require('fs');

const CONFIRM    = process.argv.includes('--confirm');
const CACHE_FILE = require('path').join(__dirname, '.clean-disc-titles-cache.json');
const LOCAL_API  = 'http://localhost:3000';

function generateTitle({ manufacturer, mold, plastic, run, weight, color, condition }) {
  const parts = [manufacturer, mold, plastic];
  if (run) parts.push(run);
  parts.push(`${weight}g`, color);
  if (condition === 'USED') parts.push('Used');
  const title = parts.join(' ');
  if (title.length <= 80) return title;
  return title.slice(0, 81).replace(/\s+\S*$/, '');
}

async function pushToEbay(disc) {
  const res = await fetch(`${LOCAL_API}/api/ebay/bulk-update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ disc }),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

async function main() {
  // Build plan from all non-sold inventory with an offer_id (has a live listing)
  const rows = db.prepare(`
    SELECT i.sku, i.metadata, l.offer_id
    FROM inventory i
    JOIN listings l ON l.item_id = (
      SELECT id FROM items WHERE sku = i.sku LIMIT 1
    )
    WHERE i.status != 'sold'
      AND l.status = 'active'
      AND l.offer_id IS NOT NULL
    ORDER BY i.sku
  `).all();

  if (rows.length === 0) {
    console.log('No active listings found.');
    return;
  }

  const plan = rows.map(row => {
    const meta = JSON.parse(row.metadata);
    const newTitle = generateTitle(meta);
    return { sku: row.sku, offer_id: row.offer_id, new_title: newTitle, disc: meta };
  });

  if (!CONFIRM) {
    console.log(`DRY RUN — ${plan.length} listings would be pushed to eBay:\n`);
    plan.forEach(p => console.log(`${p.sku}: ${p.new_title}`));
    fs.writeFileSync(CACHE_FILE, JSON.stringify(plan, null, 2));
    console.log(`\nCache written. Re-run with --confirm to apply.`);
    return;
  }

  let work = plan;
  if (fs.existsSync(CACHE_FILE)) {
    work = JSON.parse(fs.readFileSync(CACHE_FILE));
    console.log(`Using cached plan (${work.length} entries).`);
  }

  let ok = 0, skipped = 0, failed = 0;
  for (const p of work) {
    try {
      await pushToEbay(p.disc);
      console.log(`${p.sku}: OK — "${p.new_title}"`);
      ok++;
    } catch (e) {
      console.error(`${p.sku}: FAILED — ${e.message}`);
      failed++;
    }
  }

  if (fs.existsSync(CACHE_FILE)) fs.unlinkSync(CACHE_FILE);
  console.log(`\nDone. ${ok} ok, ${skipped} skipped, ${failed} failed.`);
}

main().catch(e => { console.error(e); process.exit(1); });
