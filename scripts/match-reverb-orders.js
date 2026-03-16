#!/usr/bin/env node
// Interactive: pull all Reverb selling orders, fuzzy-match against unmatched Airtable
// sold records, prompt to confirm, then write dateSold + reverbOrderNum to Airtable.
//
// Run: node scripts/match-reverb-orders.js

require('dotenv').config();
const readline = require('readline');

const BASE_ID  = 'appLj1a6YcqzA9uum';
const TABLE_ID = 'tbly2xgKYqgF96kWw';

const F = {
  name:           'fldY4lOcgWYz1Xh7f',
  status:         'fldE6NtzEZzAVH5TC',
  reverbOrderNum: 'fldman6gKCzhYPv8S',
  dateSold:       'fldcIJOUtePuaxAVH',
};

const AIRTABLE_PAT = process.env.AIRTABLE_PAT;
const REVERB_PAT   = process.env.REVERB_PAT;

if (!AIRTABLE_PAT) { console.error('Missing AIRTABLE_PAT in .env'); process.exit(1); }
if (!REVERB_PAT)   { console.error('Missing REVERB_PAT in .env'); process.exit(1); }

// ── Helpers ──────────────────────────────────────────────────────────────────

const reverbHeaders = () => ({
  'Authorization': `Bearer ${REVERB_PAT}`,
  'Accept': 'application/hal+json',
  'Accept-Version': '3.0',
});

async function airtableFetch(path, opts = {}) {
  const res = await fetch(`https://api.airtable.com/v0/${path}`, {
    ...opts,
    headers: { 'Authorization': `Bearer ${AIRTABLE_PAT}`, 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  if (!res.ok) throw new Error(`Airtable ${res.status}: ${await res.text()}`);
  return res.json();
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Fuzzy match ───────────────────────────────────────────────────────────────
// Token overlap: what fraction of the smaller set's words appear in the larger set

function similarity(a, b) {
  const tok = s => new Set(s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 1));
  const ta = tok(a), tb = tok(b);
  const overlap = [...ta].filter(t => tb.has(t)).length;
  return overlap / Math.max(ta.size, tb.size, 1);
}

// ── Fetch all Reverb selling orders ──────────────────────────────────────────

async function fetchAllReverbOrders() {
  let all = [], page = 1;
  process.stdout.write('Fetching Reverb orders');
  while (true) {
    const res = await fetch(`https://api.reverb.com/api/my/orders/selling?per_page=50&page=${page}`, { headers: reverbHeaders() });
    const data = await res.json();
    all = all.concat(data.orders || []);
    process.stdout.write('.');
    if (page >= (data.total_pages || 1)) break;
    page++;
    await sleep(300);
  }
  console.log(` ${all.length} orders`);
  return all;
}

// ── Fetch listing title for a product_id ─────────────────────────────────────

async function fetchListingTitle(productId) {
  try {
    const res = await fetch(`https://api.reverb.com/api/listings/${productId}`, { headers: reverbHeaders() });
    if (!res.ok) return null;
    const data = await res.json();
    return data.title || null;
  } catch { return null; }
}

// ── Fetch all Airtable sold records ──────────────────────────────────────────

async function fetchSoldRecords() {
  const fields = Object.values(F).map(id => `fields[]=${id}`).join('&');
  let all = [], offset = null;
  do {
    const params = `${fields}&returnFieldsByFieldId=true${offset ? '&offset=' + offset : ''}`;
    const data = await airtableFetch(`${BASE_ID}/${TABLE_ID}?${params}`);
    all = all.concat(data.records);
    offset = data.offset || null;
  } while (offset);
  return all.filter(r => r.fields[F.status] === 'Sold');
}

// ── Interactive prompt ────────────────────────────────────────────────────────

function ask(rl, question) {
  return new Promise(resolve => rl.question(question, resolve));
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // 1. Load Airtable sold records
  process.stdout.write('Fetching Airtable sold records...');
  const soldRecords = await fetchSoldRecords();
  console.log(` ${soldRecords.length} found`);

  // Split: already have dateSold or orderNum (skip), vs candidates (match)
  const alreadyMatchedOrderNums = new Set(
    soldRecords.map(r => r.fields[F.reverbOrderNum]).filter(Boolean).map(String)
  );
  const candidates = soldRecords.filter(r => !r.fields[F.dateSold]);
  console.log(`  ${candidates.length} without dateSold (candidates for matching)`);
  console.log(`  ${alreadyMatchedOrderNums.size} already have a Reverb order number\n`);

  // 2. Load Reverb orders
  const reverbOrders = await fetchAllReverbOrders();

  // Filter to orders not already in Airtable
  const unmatched = reverbOrders.filter(o => !alreadyMatchedOrderNums.has(String(o.order_number)));
  console.log(`${unmatched.length} Reverb orders not yet linked to Airtable\n`);

  if (unmatched.length === 0) {
    console.log('Nothing to match. All done!');
    return;
  }

  // 3. Fetch listing titles for unmatched orders
  console.log(`Fetching listing titles for ${unmatched.length} orders...`);
  const ordersWithTitles = [];
  for (const order of unmatched) {
    const title = await fetchListingTitle(order.product_id);
    ordersWithTitles.push({ ...order, title });
    process.stdout.write('.');
    await sleep(150);
  }
  console.log(' done\n');

  // 4. Interactive matching loop
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  let updated = 0, skipped = 0;
  const usedRecordIds = new Set(); // prevent double-assigning a record

  console.log('─'.repeat(70));
  console.log('For each Reverb order, pick a matching Airtable record.');
  console.log('Keys: y = top match  |  1-3 = pick match  |  s = skip  |  q = quit');
  console.log('─'.repeat(70) + '\n');

  for (const order of ordersWithTitles) {
    if (!order.title) {
      console.log(`[skip] Order ${order.order_number} — could not fetch listing title\n`);
      skipped++;
      continue;
    }

    const date = order.created_at ? order.created_at.split('T')[0] : '?';
    const amount = order.amount_product?.amount ? `$${order.amount_product.amount}` : '';

    // Find top 3 matches from candidates not yet used
    const scored = candidates
      .filter(r => !usedRecordIds.has(r.id))
      .map(r => ({ r, score: similarity(order.title, r.fields[F.name] || '') }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    console.log(`REVERB  #${order.order_number}  ${date}  ${amount}`);
    console.log(`  Title: ${order.title}`);

    if (scored.length === 0 || scored[0].score === 0) {
      console.log('  No candidates left to match.\n');
      skipped++;
      continue;
    }

    scored.forEach((m, i) => {
      const pct = Math.round(m.score * 100);
      console.log(`  [${i + 1}] ${pct}%  ${m.r.fields[F.name]}`);
    });

    const answer = (await ask(rl, '  → ')).trim().toLowerCase();

    if (answer === 'q') {
      console.log('\nQuitting early.');
      break;
    }

    if (answer === 's' || answer === '') {
      console.log('  skipped\n');
      skipped++;
      continue;
    }

    let chosen = null;
    if (answer === 'y') chosen = scored[0]?.r;
    else if (answer === '1') chosen = scored[0]?.r;
    else if (answer === '2') chosen = scored[1]?.r;
    else if (answer === '3') chosen = scored[2]?.r;

    if (!chosen) {
      console.log('  skipped (unrecognised input)\n');
      skipped++;
      continue;
    }

    try {
      await airtableFetch(`${BASE_ID}/${TABLE_ID}/${chosen.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          fields: {
            [F.dateSold]:       date,
            [F.reverbOrderNum]: String(order.order_number),
          },
          returnFieldsByFieldId: true,
        }),
      });
      usedRecordIds.add(chosen.id);
      console.log(`  ✓ matched → ${chosen.fields[F.name]}  (dateSold: ${date})\n`);
      updated++;
    } catch (e) {
      console.error(`  ERROR: ${e.message}\n`);
    }
  }

  rl.close();
  console.log('─'.repeat(70));
  console.log(`Done. Matched: ${updated}  Skipped: ${skipped}`);
}

main().catch(e => { console.error(e); process.exit(1); });
