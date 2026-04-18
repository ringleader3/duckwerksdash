#!/usr/bin/env node
// scripts/ebay-traffic-merge.js — merge eBay traffic report CSV with DB SKU + price
// Usage: node scripts/ebay-traffic-merge.js <traffic-report.csv> [--api <url>] [--out <output.csv>]

const fs   = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}

const inputCsv  = process.argv[2];
const apiBase   = arg('--api') || 'http://localhost:3000';
const itemsFile = arg('--items');
const outPath   = arg('--out') || 'ebay-traffic-merged.csv';

if (!inputCsv) {
  console.error('Usage: node scripts/ebay-traffic-merge.js <traffic-report.csv> [--items <items.json>] [--api <url>] [--out <output.csv>]');
  console.error('  --items  JSON file downloaded from /api/items?lot_id=9 (skips live API call)');
  process.exit(1);
}

// ── Parse eBay CSV ────────────────────────────────────────────────────────────

const raw = fs.readFileSync(inputCsv, 'utf8');

// Find the header row (starts with "Listing title")
const lines = raw.split('\n');
const headerIdx = lines.findIndex(l => l.startsWith('Listing title'));
if (headerIdx === -1) {
  console.error('Could not find header row in CSV');
  process.exit(1);
}

const csvData = parse(lines.slice(headerIdx).join('\n'), {
  columns: true,
  skip_empty_lines: true,
  relax_quotes: true,
  trim: true,
});

if (csvData.length > 0) {
  console.error('CSV columns:', Object.keys(csvData[0]).join(' | '));
}

// eBay item IDs come through as ="123456" — strip to plain number
const trafficMap = {};
for (const row of csvData) {
  const rawId = row['eBay item ID'] || '';
  const id = rawId.replace(/^="?|"?=?"?$/g, '').replace(/"/g, '').trim();
  if (id) trafficMap[id] = row;
}

console.error(`Parsed ${Object.keys(trafficMap).length} listings from traffic report`);

// ── Fetch items from DB ───────────────────────────────────────────────────────

async function fetchItems() {
  if (itemsFile) {
    const raw = JSON.parse(fs.readFileSync(itemsFile, 'utf8'));
    return Array.isArray(raw) ? raw : (raw.data ?? raw.items ?? raw);
  }
  const res = await fetch(`${apiBase}/api/items?lot_id=9`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

(async () => {
  const items = await fetchItems();
  console.error(`Fetched ${items.length} items from DB`);

  // Build map: platform_listing_id → { sku, list_price, item_name }
  const dbMap = {};
  for (const item of items) {
    for (const listing of item.listings || []) {
      if (listing.platform_listing_id && listing.site?.name === 'eBay') {
        dbMap[listing.platform_listing_id] = {
          sku:        item.sku || '',
          list_price: listing.list_price ?? '',
          item_name:  item.name,
        };
      }
    }
  }

  // ── Merge & output ────────────────────────────────────────────────────────

  const rows = [];
  let matched = 0;

  const trafficCols = [
    'Listing title',
    'eBay item ID',
    'Item Start Date',
    'Category',
    'Current promoted listings status',
    'Quantity available',
    'Total impressions',
    'Click-through rate = Page views from eBay site/Total impressions',
    'Quantity sold',
    '% Top 20 Search Impressions',
    'Sales conversion rate = Quantity sold/Total page views',
    'Top 20 search slot impressions from promoted listings',
    '% change in top 20 search slot impressions from promoted listings',
    'Top 20 search slot organic impressions',
    '% change in top 20 search slot impressions',
    'Rest of search slot impressions',
    'Total Search Impressions',
    'Non-search promoted listings impressions',
    '% Change in non-search promoted listings impressions',
    'Non-search organic impressions',
    '% Change in non-search organic impressions',
    'Total Promoted Listings impressions (applies to eBay site only)',
    'Total Promoted Offsite impressions (applies to off-eBay only)',
    'Total organic impressions on eBay site',
    'Total page views',
    'Page views via promoted listings impressions on eBay site',
    'Page views via promoted listings Impressions from outside eBay (search engines, affilliates)',
    'Page views via organic impressions on eBay site',
    'Page views from organic impressions outside eBay (Includes page views from search engines)',
  ];

  for (const [ebayId, traffic] of Object.entries(trafficMap)) {
    const db = dbMap[ebayId] || {};
    if (db.sku) matched++;
    if (!db.sku) continue;
    const row = { 'SKU': db.sku, 'List Price': db.list_price ?? '' };
    for (const col of trafficCols) row[col] = traffic[col] ?? '';
    rows.push(row);
  }

  console.error(`Matched ${matched}/${Object.keys(trafficMap).length} listings to DB records`);

  // Write CSV
  const headers = Object.keys(rows[0]);
  const escape  = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csvOut  = [
    headers.map(escape).join(','),
    ...rows.map(r => headers.map(h => escape(r[h])).join(',')),
  ].join('\n');

  fs.writeFileSync(outPath, csvOut, 'utf8');
  console.error(`Written to ${outPath}`);
})();
