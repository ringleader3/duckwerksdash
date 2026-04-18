#!/usr/bin/env node
// scripts/bulk-list-discs.js — eBay bulk listing/updating from CSV or Google Sheet
// Usage: node scripts/bulk-list-discs.js --sheet <url> --photos <dir> --ids <ids> [--api <url>] [--confirm]
//        node scripts/bulk-list-discs.js --csv <path>  --photos <dir> --ids <ids> [--api <url>] [--confirm]
//        node scripts/bulk-list-discs.js --sheet <url> --ids <ids> --update [--confirm]  (updates title/description/price on existing listings)

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
const confirm       = process.argv.includes('--confirm');
const updateMode    = process.argv.includes('--update');
const photosOnlyMode = process.argv.includes('--photos-only');
const maxRetries    = parseInt(arg('--retries') || '3', 10);

if ((!sheetUrl && !csvPath) || !idsArg || (!updateMode && !photosDir)) {
  console.error('Usage: node scripts/bulk-list-discs.js --sheet <url> --photos <dir> --ids <ids> [--api <url>] [--confirm]');
  console.error('       node scripts/bulk-list-discs.js --sheet <url> --ids <ids> --update [--confirm]');
  console.error('       node scripts/bulk-list-discs.js --sheet <url> --photos <dir> --ids <ids> --photos-only [--confirm]');
  console.error('       <ids> accepts ranges and lists: 1-20,25,30-35');
  console.error('       Omit --confirm to do a dry run (default)');
  process.exit(1);
}

if (photosOnlyMode && updateMode) {
  console.error('--photos-only and --update are mutually exclusive');
  process.exit(1);
}

function parseIds(str) {
  const ids = new Set();
  for (const seg of str.split(',')) {
    const parts = seg.trim().split('-').map(Number);
    if (parts.length === 1 && !isNaN(parts[0])) {
      ids.add(parts[0]);
    } else if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1]) && parts[0] <= parts[1]) {
      for (let i = parts[0]; i <= parts[1]; i++) ids.add(i);
    } else {
      console.error(`Invalid --ids segment: "${seg}" — use format 1-20,25,30-35`);
      process.exit(1);
    }
  }
  return ids;
}

const targetIds = parseIds(idsArg);

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

  // Filter to the requested IDs
  const rangeRows = records.filter(r => targetIds.has(parseInt(r['Disc #'], 10)));

  if (rangeRows.length === 0) {
    console.error(`No rows found for the requested IDs. Check the 'Disc #' column.`);
    process.exit(1);
  }

  // Build per-disc plan: validate + collect photos
  const plan = rangeRows.map(row => {
    const id       = parseInt(row['Disc #'], 10);
    const paddedId = String(id).padStart(3, '0');
    const title    = (row['List Title'] || '').trim();
    const price    = parseFloat((row['List Price'] || '').replace(/[$,]/g, ''));

    const warnings = [];
    if (!row['List Price'] || isNaN(price) || price <= 0) warnings.push('no List Price');

    // Skip sold items in all modes
    if ((row['Sold'] || '').toUpperCase() === 'TRUE') return { id, paddedId, row, title, skip: 'sold' };

    if (updateMode) {
      return { id, paddedId, row, title, price, warnings: warnings.length ? warnings : null };
    }

    if (photosOnlyMode) {
      const photoPattern = new RegExp(`^DWG-${id}-.*\\.jpe?g$`, 'i');
      const photoFiles   = fs.readdirSync(photosDir).filter(f => photoPattern.test(f));
      if (photoFiles.length === 0) return { id, paddedId, row, title, skip: 'no photos' };
      return { id, paddedId, row, title, photoFiles };
    }

    const photoPattern = new RegExp(`^DWG-${id}-.*\\.jpe?g$`, 'i');
    const photoFiles   = fs.readdirSync(photosDir).filter(f => photoPattern.test(f));
    if (photoFiles.length === 0) warnings.push('no photos');

    return { id, paddedId, row, title, price, photoFiles, warnings: warnings.length ? warnings : null };
  });

  const total = plan.length;

  // ── Dry run ───────────────────────────────────────────────────────────────

  if (!confirm) {
    const action = updateMode ? 'updated' : photosOnlyMode ? 'photos updated' : 'listed';
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
      } else if (photosOnlyMode) {
        console.log(`${label}  ${t}  would update photos  (${p.photoFiles.length} photo${p.photoFiles.length !== 1 ? 's' : ''})`);
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

  async function runBatch(batch, cycleLabel) {
    let listed = 0, skipped = 0, errorIds = [];
    const batchTotal = batch.length;
    for (let i = 0; i < batchTotal; i++) {
      const p     = batch[i];
      const label = `${cycleLabel}[${i + 1}/${batchTotal}] DWG-${p.paddedId}`;
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
          color:        p.row['Color']          || '',
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
            errorIds.push(p.id);
            skipped++;
            continue;
          }
          console.log(`${label}  ${t}  updated`);
          listed++;
        } else if (photosOnlyMode) {
          const formData = new FormData();
          formData.set('disc', JSON.stringify(disc));
          for (const filename of p.photoFiles) {
            const buf  = fs.readFileSync(path.join(photosDir, filename));
            const blob = new Blob([buf], { type: 'image/jpeg' });
            formData.set(`photos[${filename.replace(/\.jpe?g$/i, '')}]`, blob, filename);
          }
          response = await fetch(`${apiBase}/api/ebay/bulk-photos`, { method: 'POST', body: formData });
          result = await response.json();
          if (result.error) {
            console.log(`${label}  ${t}  ERROR — ${result.error}`);
            errorIds.push(p.id);
            skipped++;
            continue;
          }
          console.log(`${label}  ${t}  photos updated  (${result.photoCount})`);
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
            errorIds.push(p.id);
            skipped++;
            continue;
          }
          console.log(`${label}  ${t}  listed  ${result.url}`);
          listed++;
        }
      } catch (e) {
        console.log(`${label}  ${t}  ERROR — ${e.message}`);
        errorIds.push(p.id);
        skipped++;
      }
    }
    return { listed, skipped, errorIds };
  }

  const action = updateMode ? 'updated' : photosOnlyMode ? 'photos updated' : 'listed';
  let totalListed = 0, totalSkipped = 0;
  let { listed, skipped, errorIds } = await runBatch(plan, '');
  totalListed  += listed;
  totalSkipped += skipped;

  // Auto-retry error IDs up to maxRetries times with a short delay
  for (let cycle = 1; cycle <= maxRetries && errorIds.length > 0; cycle++) {
    console.log(`\nRetrying ${errorIds.length} error(s) — cycle ${cycle}/${maxRetries} (waiting 10s)...`);
    await new Promise(r => setTimeout(r, 10000));
    const retryPlan = plan.filter(p => errorIds.includes(p.id));
    ({ listed, skipped, errorIds } = await runBatch(retryPlan, `[retry ${cycle}] `));
    totalListed  += listed;
    totalSkipped += skipped;
  }

  console.log(`\nDone: ${totalListed} ${action}, ${totalSkipped} skipped`);
  if (errorIds.length) console.log(`Still failing after ${maxRetries} retries: --ids ${errorIds.join(',')}`);
}

main().catch(e => { console.error(e.message); process.exit(1); });
