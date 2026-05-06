// scripts/backfill-inventory-from-sheet.js
// Usage: node scripts/backfill-inventory-from-sheet.js [--confirm]
const { google } = require('googleapis');
const path       = require('path');
const Database   = require('better-sqlite3');

const SHEET_ID   = '1Gmdw2qcHRA_9wz29CXul3pTCT92pX56V4FPLkrhNnHE';
const SHEET_NAME = 'duckwerks-dg-catalog';
const KEY_PATH   = path.join(__dirname, '..', 'docs', 'handicaps-244e5d936e6c.json');
const DB_PATH    = path.join(__dirname, '..', 'data', 'duckwerks.db');
const confirm    = process.argv.includes('--confirm');

const upsert = `
  INSERT INTO inventory (sku, location, category, status)
  VALUES (@sku, @location, 'disc', 'intake')
  ON CONFLICT(sku) DO UPDATE SET
    location = excluded.location,
    category = excluded.category
`;

async function main() {
  const auth   = new google.auth.GoogleAuth({ keyFile: KEY_PATH, scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] });
  const sheets = google.sheets({ version: 'v4', auth });
  const resp   = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${SHEET_NAME}!A:B` });
  const rows   = (resp.data.values || []).slice(1).filter(r => r[0]);

  const records = rows.map(r => ({
    sku:      `DWG-${String(parseInt(r[0], 10)).padStart(3, '0')}`,
    location: r[1] || null,
  }));

  console.log(`Found ${records.length} disc rows`);
  records.forEach(r => console.log(`  ${r.sku}  →  ${r.location || '(no location)'}`));

  if (!confirm) {
    console.log('\nDry run — pass --confirm to write');
    return;
  }

  const db   = new Database(DB_PATH);
  const stmt = db.prepare(upsert);
  const run  = db.transaction(() => records.forEach(r => stmt.run(r)));
  run();
  console.log(`\nInserted/updated ${records.length} rows in inventory`);
  db.close();
}

main().catch(e => { console.error(e); process.exit(1); });
