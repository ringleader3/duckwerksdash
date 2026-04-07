#!/usr/bin/env node
// scripts/bulk-list-discs.js — eBay bulk listing/updating from CSV or Google Sheet
// Usage: node scripts/bulk-list-discs.js --sheet <url> --photos <dir> --ids <start>-<end> [--api <url>] [--dry-run]
//        node scripts/bulk-list-discs.js --csv <path>  --photos <dir> --ids <start>-<end> [--api <url>] [--dry-run]
//        node scripts/bulk-list-discs.js --sheet <url> --ids <start>-<end> --update  (updates title/description/price on existing listings)

const fs   = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

// ── CLI args ──────────────────────────────────────────────────────────────────

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}

const sheetUrl  = arg('--sheet');
const csvPath   = arg('--csv');
const photosDir = arg('--photos');
const idsArg    = arg('--ids');
const apiBase   = arg('--api') || 'http://localhost:3000';
const dryRun    = process.argv.includes('--dry-run');
const updateMode = process.argv.includes('--update');

if ((!sheetUrl && !csvPath) || !idsArg || (!updateMode && !photosDir)) {
  console.error('Usage: node scripts/bulk-list-discs.js --sheet <url> --photos <dir> --ids <start>-<end> [--api <url>] [--dry-run]');
  console.error('       node scripts/bulk-list-discs.js --sheet <url> --ids <start>-<end> --update');
  process.exit(1);
}

const [startId, endId] = idsArg.split('-').map(Number);
if (isNaN(startId) || isNaN(endId) || startId > endId) {
  console.error(`Invalid --ids: "${idsArg}" — use format 1-20`);
  process.exit(1);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  let csvText;
  if (sheetUrl) {
    const res = await fetch(sheetUrl);
    if (!res.ok) throw new Error(`Failed to fetch sheet: ${res.status}`);
    csvText = await res.text();
  } else {
    csvText = fs.readFileSync(csvPath, 'utf8');
  }

  const records = parse(csvText, { columns: true, skip_empty_lines: true, bom: true });

  if (records.length === 0) {
    console.error('CSV has no rows.');
    process.exit(1);
  }

  // Filter to the requested ID range
  const rangeRows = records.filter(r => {
    const id = parseInt(r['Disc #'], 10);
    return id >= startId && id <= endId;
  });

  if (rangeRows.length === 0) {
    console.error(`No rows found with Disc ID ${startId}–${endId}. Check the 'Disc ID' column.`);
    process.exit(1);
  }

  // Build per-disc plan: validate + collect photos
  const plan = rangeRows.map(row => {
    const id       = parseInt(row['Disc #'], 10);
    const paddedId = String(id).padStart(3, '0');
    const title    = (row['List Title'] || '').trim();
    const price    = parseFloat((row['List Price'] || '').replace(/[$,]/g, ''));
    const ebayUrl  = (row['eBay URL'] || '').trim();

    const warnings = [];
    if (!title)                                           warnings.push('no List Title');
    if (!row['List Price'] || isNaN(price) || price <= 0) warnings.push('no List Price');

    if (updateMode) {
      // In update mode: only process items that are already listed
      if (!ebayUrl) return { id, paddedId, row, title, price, skip: 'not yet listed' };
      return { id, paddedId, row, title, price, warnings: warnings.length ? warnings : null };
    }

    // List mode: skip already-listed items, require photos
    if (ebayUrl) return { id, paddedId, row, title, skip: 'already listed' };

    const photoPattern = new RegExp(`^DWG-${id}-.*\\.jpe?g$`, 'i');
    const photoFiles   = fs.readdirSync(photosDir).filter(f => photoPattern.test(f));
    if (photoFiles.length === 0) warnings.push('no photos');

    return { id, paddedId, row, title, price, photoFiles, warnings: warnings.length ? warnings : null };
  });

  const total = plan.length;

  // ── Dry run ───────────────────────────────────────────────────────────────

  if (dryRun) {
    const action = updateMode ? 'updated' : 'listed';
    console.log(`\nDRY RUN — no listings will be ${action} (target: ${apiBase})\n`);
    let wouldAct = 0, wouldSkip = 0;
    plan.forEach((p, i) => {
      const label = `[${i + 1}/${total}] DWG-${p.paddedId}`;
      const t     = (p.title || '').slice(0, 42).padEnd(42);
      if (p.skip) {
        console.log(`${label}  ${t}  skipped — ${p.skip}`);
        wouldSkip++;
      } else if (p.warnings) {
        console.log(`${label}  ${t}  skipped — ${p.warnings.join(', ')}`);
        wouldSkip++;
      } else if (updateMode) {
        console.log(`${label}  ${t}  would update @ $${p.price}`);
        wouldAct++;
      } else {
        console.log(`${label}  ${t}  would list @ $${p.price}  (${p.photoFiles.length} photo${p.photoFiles.length !== 1 ? 's' : ''})`);
        wouldAct++;
      }
    });
    console.log(`\nDry run: ${wouldAct} would be ${action}, ${wouldSkip} would be skipped`);
    return;
  }

  // ── Live run ──────────────────────────────────────────────────────────────

  let listed = 0, skipped = 0;

  for (let i = 0; i < plan.length; i++) {
    const p     = plan[i];
    const label = `[${i + 1}/${total}] DWG-${p.paddedId}`;
    const t     = (p.title || '').slice(0, 42).padEnd(42);

    if (p.skip || p.warnings) {
      console.log(`${label}  ${t}  skipped — ${p.skip || p.warnings.join(', ')}`);
      skipped++;
      continue;
    }

    try {
      const disc = {
        id:           p.id,
        title:        p.title,
        listPrice:    p.price,
        description:  p.row['Description']    || '',
        condition:    p.row['Condition']      || '',
        manufacturer: p.row['Manufacturer']   || '',
        mold:         p.row['Mold']           || '',
        type:         p.row['Type']           || '',
        plastic:      p.row['Plastic']        || '',
        run:          p.row['Run / Edition']  || '',
        weight:       p.row['Weight (g)']     || '',
        notes:        p.row['Notes']          || '',
      };

      let response, result;

      if (updateMode) {
        response = await fetch(`${apiBase}/api/ebay/bulk-update`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ disc }),
        });
        result = await response.json();
        if (result.error) {
          console.log(`${label}  ${t}  ERROR — ${result.error}`);
          skipped++;
          continue;
        }
        console.log(`${label}  ${t}  updated`);
        listed++;
      } else {
        const formData = new FormData();
        formData.set('disc', JSON.stringify(disc));
        for (const filename of p.photoFiles) {
          const buf  = fs.readFileSync(path.join(photosDir, filename));
          const blob = new Blob([buf], { type: 'image/jpeg' });
          formData.set(`photos[${filename.replace(/\.jpe?g$/i, '')}]`, blob, filename);
        }
        response = await fetch(`${apiBase}/api/ebay/bulk-list`, { method: 'POST', body: formData });
        result = await response.json();
        if (result.error) {
          console.log(`${label}  ${t}  ERROR — ${result.error}`);
          skipped++;
          continue;
        }
        console.log(`${label}  ${t}  listed  ${result.url}`);
        listed++;
      }
    } catch (e) {
      console.log(`${label}  ${t}  ERROR — ${e.message}`);
      skipped++;
    }
  }

  const action = updateMode ? 'updated' : 'listed';
  console.log(`\nDone: ${listed} ${action}, ${skipped} skipped`);
}

main().catch(e => { console.error(e.message); process.exit(1); });
