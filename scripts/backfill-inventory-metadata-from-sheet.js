// scripts/backfill-inventory-metadata-from-sheet.js
// Merges full disc metadata from the DG sheet into existing inventory blobs.
// Column map: A=Disc#, B=Box, C=ListTitle, D=Description, E=Sold,
//   F=Manufacturer, G=Mold, H=Type, I=Plastic, J=Run/Edition,
//   K=Notes, L=Condition, M=Weight, N=Color, O=EstValue, P=ListPrice,
//   Q=Platform, R=Status, S=CompPull, T=speed, U=glide, V=turn, W=fade, X=stability
// Only overwrites fields with non-empty values from the sheet.
// Usage: node scripts/backfill-inventory-metadata-from-sheet.js [--confirm]
const { google } = require('googleapis');
const path       = require('path');
const Database   = require('better-sqlite3');

const SHEET_ID   = '1Gmdw2qcHRA_9wz29CXul3pTCT92pX56V4FPLkrhNnHE';
const SHEET_NAME = 'duckwerks-dg-catalog';
const KEY_PATH   = path.join(__dirname, '..', 'docs', 'handicaps-244e5d936e6c.json');
const DB_PATH    = path.join(__dirname, '..', 'data', 'duckwerks.db');
const confirm    = process.argv.includes('--confirm');

function col(row, idx) { return (row[idx] || '').trim(); }

async function main() {
  const auth   = new google.auth.GoogleAuth({ keyFile: KEY_PATH, scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] });
  const sheets = google.sheets({ version: 'v4', auth });
  const resp   = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${SHEET_NAME}!A:X` });
  const rows   = (resp.data.values || []).slice(1).filter(r => r[0]);

  const db      = new Database(DB_PATH);
  const getSku  = db.prepare('SELECT metadata FROM inventory WHERE sku = ?');
  const patchMd = db.prepare('UPDATE inventory SET metadata = ? WHERE sku = ?');

  let updated = 0, skipped = 0;

  for (const r of rows) {
    const discNum = parseInt(r[0], 10);
    const sku     = `DWG-${String(discNum).padStart(3, '0')}`;

    const existing = getSku.get(sku);
    if (!existing) { console.log(`  ${sku}  — not in inventory, skipping`); skipped++; continue; }

    const meta = existing.metadata ? JSON.parse(existing.metadata) : {};

    const fromSheet = {
      manufacturer: col(r, 5),   // F
      mold:         col(r, 6),   // G
      type:         col(r, 7),   // H
      plastic:      col(r, 8),   // I
      run:          col(r, 9),   // J
      notes:        col(r, 10),  // K
      condition:    col(r, 11),  // L
      weight:       col(r, 12),  // M
      color:        col(r, 13),  // N
      listPrice:    col(r, 15),  // P
      list_title:   col(r, 2),   // C
      description:  col(r, 3),   // D
      speed:        col(r, 19),  // T
      glide:        col(r, 20),  // U
      turn:         col(r, 21),  // V
      fade:         col(r, 22),  // W
      stability:    col(r, 23),  // X
    };

    const patch = { ...meta };
    for (const [key, val] of Object.entries(fromSheet)) {
      if (val) patch[key] = val;
    }

    console.log(`  ${sku}  ${fromSheet.manufacturer} ${fromSheet.mold}  price=${fromSheet.listPrice || '—'}`);
    if (confirm) patchMd.run(JSON.stringify(patch), sku);
    updated++;
  }

  console.log(`\n${confirm ? 'Updated' : 'Would update'} ${updated} rows, skipped ${skipped}`);
  if (!confirm) console.log('Dry run — pass --confirm to write');
  db.close();
}

main().catch(e => { console.error(e); process.exit(1); });
