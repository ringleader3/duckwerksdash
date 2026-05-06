// scripts/backfill-inventory-copy-from-sheet.js
// Merges list_title, description, and listPrice from the DG sheet into existing inventory blobs.
// Only writes fields that are non-empty in the sheet — never overwrites with blanks.
// Usage: node scripts/backfill-inventory-copy-from-sheet.js [--confirm]
const { google } = require('googleapis');
const path       = require('path');
const Database   = require('better-sqlite3');

const SHEET_ID   = '1Gmdw2qcHRA_9wz29CXul3pTCT92pX56V4FPLkrhNnHE';
const SHEET_NAME = 'duckwerks-dg-catalog';
const KEY_PATH   = path.join(__dirname, '..', 'docs', 'handicaps-244e5d936e6c.json');
const DB_PATH    = path.join(__dirname, '..', 'data', 'duckwerks.db');
const confirm    = process.argv.includes('--confirm');

async function main() {
  const auth   = new google.auth.GoogleAuth({ keyFile: KEY_PATH, scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] });
  const sheets = google.sheets({ version: 'v4', auth });
  // A=Disc#, C=List Title, D=Description, P=List Price
  const resp   = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${SHEET_NAME}!A:P` });
  const rows   = (resp.data.values || []).slice(1).filter(r => r[0]);

  const db      = new Database(DB_PATH);
  const getSku  = db.prepare('SELECT metadata FROM inventory WHERE sku = ?');
  const patchMd = db.prepare('UPDATE inventory SET metadata = ? WHERE sku = ?');

  let updated = 0, skipped = 0;

  for (const r of rows) {
    const discNum    = parseInt(r[0], 10);
    const sku        = `DWG-${String(discNum).padStart(3, '0')}`;
    const list_title = (r[2] || '').trim();
    const description = (r[3] || '').trim();
    const listPrice  = (r[15] || '').replace(/[$,]/g, '').trim();

    // Nothing curated in this row
    if (!list_title && !description && !listPrice) { skipped++; continue; }

    const existing = getSku.get(sku);
    if (!existing) { console.log(`  ${sku}  — not in inventory, skipping`); skipped++; continue; }

    const meta = existing.metadata ? JSON.parse(existing.metadata) : {};
    const patch = { ...meta };
    if (list_title)  patch.list_title   = list_title;
    if (description) patch.description  = description;
    if (listPrice)   patch.listPrice    = listPrice;

    console.log(`  ${sku}  title=${list_title || '—'}  price=${listPrice || '—'}  desc=${description ? 'yes' : '—'}`);

    if (confirm) patchMd.run(JSON.stringify(patch), sku);
    updated++;
  }

  console.log(`\n${confirm ? 'Updated' : 'Would update'} ${updated} rows, skipped ${skipped}`);
  if (!confirm) console.log('Dry run — pass --confirm to write');
  db.close();
}

main().catch(e => { console.error(e); process.exit(1); });
