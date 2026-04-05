#!/usr/bin/env node
// scripts/bulk-list-discs.js — eBay bulk listing from CSV
// Usage: node scripts/bulk-list-discs.js --csv <path> --photos <dir> --ids <start>-<end> [--api <url>] [--dry-run]

const fs   = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

// ── CLI args ──────────────────────────────────────────────────────────────────

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}

const csvPath   = arg('--csv');
const photosDir = arg('--photos');
const idsArg    = arg('--ids');
const apiBase   = arg('--api') || 'http://localhost:3000';
const dryRun    = process.argv.includes('--dry-run');

if (!csvPath || !photosDir || !idsArg) {
  console.error('Usage: node scripts/bulk-list-discs.js --csv <path> --photos <dir> --ids <start>-<end> [--api <url>] [--dry-run]');
  process.exit(1);
}

const [startId, endId] = idsArg.split('-').map(Number);
if (isNaN(startId) || isNaN(endId) || startId > endId) {
  console.error(`Invalid --ids: "${idsArg}" — use format 1-20`);
  process.exit(1);
}

// ── CSV helpers ───────────────────────────────────────────────────────────────

function csvEscape(val) {
  if (val == null) return '';
  const s = String(val);
  return (s.includes(',') || s.includes('"') || s.includes('\n'))
    ? '"' + s.replace(/"/g, '""') + '"'
    : s;
}

function serializeCSV(headers, rows) {
  return [
    headers.map(csvEscape).join(','),
    ...rows.map(r => headers.map(h => csvEscape(r[h] ?? '')).join(',')),
  ].join('\n') + '\n';
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const csvText = fs.readFileSync(csvPath, 'utf8');
  const records = parse(csvText, { columns: true, skip_empty_lines: true, bom: true });

  if (records.length === 0) {
    console.error('CSV has no rows.');
    process.exit(1);
  }

  const headers = Object.keys(records[0]);
  if (!headers.includes('eBay Listing ID')) headers.push('eBay Listing ID');
  if (!headers.includes('eBay URL'))        headers.push('eBay URL');

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

    if (ebayUrl) return { id, paddedId, row, title, skip: 'already listed' };

    const warnings = [];
    if (!title)                                        warnings.push('no List Title');
    if (!row['List Price'] || isNaN(price) || price <= 0) warnings.push('no List Price');

    const photoPattern = new RegExp(`^DWG-${id}-.*\\.jpe?g$`, 'i');
    const photoFiles   = fs.readdirSync(photosDir).filter(f => photoPattern.test(f));
    if (photoFiles.length === 0) warnings.push('no photos');

    return { id, paddedId, row, title, price, photoFiles, warnings: warnings.length ? warnings : null };
  });

  const total = plan.length;

  // ── Dry run ───────────────────────────────────────────────────────────────

  if (dryRun) {
    console.log(`\nDRY RUN — no listings will be created (target: ${apiBase})\n`);
    let wouldList = 0, wouldSkip = 0;
    plan.forEach((p, i) => {
      const label = `[${i + 1}/${total}] DWG-${p.paddedId}`;
      const t     = (p.title || '').slice(0, 42).padEnd(42);
      if (p.skip) {
        console.log(`${label}  ${t}  skipped — ${p.skip}`);
        wouldSkip++;
      } else if (p.warnings) {
        console.log(`${label}  ${t}  skipped — ${p.warnings.join(', ')}`);
        wouldSkip++;
      } else {
        console.log(`${label}  ${t}  would list @ $${p.price}  (${p.photoFiles.length} photo${p.photoFiles.length !== 1 ? 's' : ''})`);
        wouldList++;
      }
    });
    console.log(`\nDry run: ${wouldList} would be listed, ${wouldSkip} would be skipped`);
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
      const formData = new FormData();
      formData.set('disc', JSON.stringify({
        id:           p.id,
        title:        p.title,
        listPrice:    p.price,
        description:  p.row['Description']   || '',
        condition:    p.row['Condition']    || '',
        manufacturer: p.row['Manufacturer'] || '',
        mold:         p.row['Mold']         || '',
        type:         p.row['Type']         || '',
        plastic:      p.row['Plastic']      || '',
        run:          p.row['Run / Edition'] || '',
        weight:       p.row['Weight (g)']   || '',
        notes:        p.row['Notes']        || '',
      }));

      for (const filename of p.photoFiles) {
        const buf  = fs.readFileSync(path.join(photosDir, filename));
        const blob = new Blob([buf], { type: 'image/jpeg' });
        formData.set(`photos[${filename.replace(/\.jpe?g$/i, '')}]`, blob, filename);
      }

      const response = await fetch(`${apiBase}/api/ebay/bulk-list`, {
        method: 'POST',
        body:   formData,
      });
      const result = await response.json();

      if (result.error) {
        console.log(`${label}  ${t}  ERROR — ${result.error}`);
        skipped++;
        continue;
      }

      // Write eBay columns back to the in-memory row and save CSV immediately
      p.row['eBay Listing ID'] = result.listingId;
      p.row['eBay URL']        = result.url;
      fs.writeFileSync(csvPath, serializeCSV(headers, records));

      console.log(`${label}  ${t}  listed  ${result.url}`);
      listed++;
    } catch (e) {
      console.log(`${label}  ${t}  ERROR — ${e.message}`);
      skipped++;
    }
  }

  console.log(`\nDone: ${listed} listed, ${skipped} skipped`);
}

main().catch(e => { console.error(e.message); process.exit(1); });
