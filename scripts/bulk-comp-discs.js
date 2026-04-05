#!/usr/bin/env node
// scripts/bulk-comp-discs.js — bulk comp research for disc golf inventory
// Usage: node scripts/bulk-comp-discs.js --sheet <url> --ids <start>-<end> [--api <url>] [--sources ebay,reverb] [--out <file>]
//        node scripts/bulk-comp-discs.js --csv <path>  --ids <start>-<end> [--api <url>] [--sources ebay,reverb] [--out <file>]
//
// --sheet: Google Sheets CSV export URL (File > Share > Publish to web > CSV)
// --csv:   local CSV file path (fallback)
//
// For each disc in range: POST /api/comps/search → POST /api/comps/analyze
// Writes a combined text file with analysis + CSV table per disc.
// Analysis calls are sequential to avoid Claude rate limits.

const fs   = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}

const sheetUrl = arg('--sheet');
const csvPath  = arg('--csv');
const idsArg   = arg('--ids');
const apiBase  = arg('--api')     || 'http://localhost:3000';
const sources  = arg('--sources') || 'ebay';
const outFile  = arg('--out')     || null;

if ((!sheetUrl && !csvPath) || !idsArg) {
  console.error('Usage: node scripts/bulk-comp-discs.js --sheet <url> --ids <start>-<end> [--api <url>] [--sources ebay,reverb] [--out <file>]');
  process.exit(1);
}

const [startId, endId] = idsArg.split('-').map(Number);
if (isNaN(startId) || isNaN(endId) || startId > endId) {
  console.error(`Invalid --ids: "${idsArg}" — use format 1-20`);
  process.exit(1);
}

async function main() {
  let csvText;
  if (sheetUrl) {
    const res = await fetch(sheetUrl);
    if (!res.ok) throw new Error(`Failed to fetch sheet: ${res.status}`);
    csvText = await res.text();
  } else {
    csvText = fs.readFileSync(csvPath, 'utf8');
  }

  const records = parse(csvText, {
    columns: true, skip_empty_lines: true, bom: true,
  });

  const discs = records.filter(r => {
    const id = parseInt(r['Disc #'], 10);
    return id >= startId && id <= endId;
  });

  if (discs.length === 0) {
    console.error(`No rows found with Disc # ${startId}–${endId}.`);
    process.exit(1);
  }

  const output = [];
  let done = 0, failed = 0;

  for (const row of discs) {
    const id       = parseInt(row['Disc #'], 10);
    const title    = (row['List Title'] || '').trim();
    const price    = parseFloat((row['List Price'] || '').replace(/[$,]/g, ''));
    const minPrice = price > 0 ? Math.floor(price * 0.6) : undefined;

    process.stdout.write(`[${id}] ${title.slice(0, 50)} — searching...`);

    try {
      // Step 1: search
      const searchRes = await fetch(`${apiBase}/api/comps/search`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [{
            name:        title,
            sources,
            ...(minPrice       && { minPrice }),
            ...(row['Comp Pull']?.trim() && { searchQuery: row['Comp Pull'].trim() }),
            notes:       [row['Plastic'], row['Run / Edition'], row['Condition']].filter(Boolean).join(', '),
          }],
        }),
      });
      const searchData = await searchRes.json();
      const result = searchData.results?.[0];

      if (!result || result.listings?.length === 0) {
        process.stdout.write(` no listings found\n`);
        failed++;
        continue;
      }

      process.stdout.write(` ${result.listings.length} listings — analyzing...`);

      // Step 2: analyze (sequential — Claude rate limits)
      const analyzeRes = await fetch(`${apiBase}/api/comps/analyze`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item: result }),
      });
      const analyzeData = await analyzeRes.json();

      if (analyzeData.error) {
        process.stdout.write(` ERROR — ${analyzeData.error}\n`);
        failed++;
        continue;
      }

      process.stdout.write(` done\n`);

      output.push([
        `${'='.repeat(72)}`,
        `DWG-${String(id).padStart(3, '0')}  ${title}`,
        `List Price: $${price || 'not set'}  |  Sources: ${sources}  |  Listings found: ${result.listings.length}`,
        `${'='.repeat(72)}`,
        '',
        analyzeData.analysis || '',
        '',
        analyzeData.csv || '',
        '',
      ].join('\n'));

      done++;
    } catch (e) {
      process.stdout.write(` ERROR — ${e.message}\n`);
      failed++;
    }
  }

  const combined = output.join('\n');

  if (outFile) {
    fs.writeFileSync(outFile, combined);
    console.log(`\nWrote results to ${outFile}`);
  } else {
    console.log('\n' + combined);
  }

  console.log(`Done: ${done} analyzed, ${failed} failed`);
}

main().catch(e => { console.error(e.message); process.exit(1); });
