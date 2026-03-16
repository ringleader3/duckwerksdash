#!/usr/bin/env node
// Backfill Date Sold from Reverb orders for sold items that have a reverbOrderNum.
// Run once: node scripts/backfill-sold-dates.js
// Safe to re-run — skips records that already have a dateSold value.

require('dotenv').config();

const BASE_ID  = 'appLj1a6YcqzA9uum';
const TABLE_ID = 'tbly2xgKYqgF96kWw';

const F = {
  status:         'fldE6NtzEZzAVH5TC',
  reverbOrderNum: 'fldman6gKCzhYPv8S',
  dateSold:       'fldcIJOUtePuaxAVH',
};

const AIRTABLE_PAT = process.env.AIRTABLE_PAT;
const REVERB_PAT   = process.env.REVERB_PAT;

if (!AIRTABLE_PAT) { console.error('Missing AIRTABLE_PAT in .env'); process.exit(1); }
if (!REVERB_PAT)   { console.error('Missing REVERB_PAT in .env'); process.exit(1); }

async function airtableFetch(path, opts = {}) {
  const res = await fetch(`https://api.airtable.com/v0/${path}`, {
    ...opts,
    headers: {
      'Authorization': `Bearer ${AIRTABLE_PAT}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`Airtable ${res.status}: ${await res.text()}`);
  return res.json();
}

async function fetchAllSoldRecords() {
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

async function getReverbOrderDate(orderNum) {
  const res = await fetch(`https://api.reverb.com/api/my/orders/selling/${orderNum}`, {
    headers: {
      'Authorization': `Bearer ${REVERB_PAT}`,
      'Accept': 'application/hal+json',
      'Accept-Version': '3.0',
    },
  });
  if (!res.ok) throw new Error(`Reverb ${res.status} for order ${orderNum}`);
  const data = await res.json();
  // created_at is ISO 8601 — take date portion only
  return data.created_at ? data.created_at.split('T')[0] : null;
}

async function main() {
  console.log('Fetching sold records from Airtable...');
  const sold = await fetchAllSoldRecords();
  console.log(`Found ${sold.length} sold records`);

  let updated = 0, skipped = 0, failed = 0;

  for (const r of sold) {
    const name     = r.fields['fldY4lOcgWYz1Xh7f'] || r.id; // F.name for logging
    const orderNum = r.fields[F.reverbOrderNum];
    const existing = r.fields[F.dateSold];

    if (existing) {
      console.log(`  SKIP  ${name} — already has dateSold: ${existing}`);
      skipped++;
      continue;
    }

    if (!orderNum) {
      console.log(`  SKIP  ${name} — no reverbOrderNum`);
      skipped++;
      continue;
    }

    try {
      const date = await getReverbOrderDate(orderNum);
      if (!date) {
        console.log(`  SKIP  ${name} — Reverb order ${orderNum} had no created_at`);
        skipped++;
        continue;
      }

      await airtableFetch(`${BASE_ID}/${TABLE_ID}/${r.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ fields: { [F.dateSold]: date }, returnFieldsByFieldId: true }),
      });

      console.log(`  OK    ${name} — set dateSold: ${date}`);
      updated++;

      // Polite rate limiting — Airtable allows 5 req/s
      await new Promise(res => setTimeout(res, 250));
    } catch (e) {
      console.error(`  FAIL  ${name} — ${e.message}`);
      failed++;
    }
  }

  console.log(`\nDone. Updated: ${updated}  Skipped: ${skipped}  Failed: ${failed}`);
}

main().catch(e => { console.error(e); process.exit(1); });
