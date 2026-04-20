#!/usr/bin/env node
// scripts/backfill-flight-numbers.js
// Usage: node scripts/backfill-flight-numbers.js [--confirm] [--force]
//   Dry run by default. --confirm writes to sheet. --force overwrites existing values.

const path   = require('path');
const { google } = require('googleapis');
const db     = require('../server/db');

const SHEET_ID   = '1Gmdw2qcHRA_9wz29CXul3pTCT92pX56V4FPLkrhNnHE';
const SHEET_NAME = 'duckwerks-dg-catalog';
const KEY_PATH   = path.join(__dirname, '..', 'docs', 'handicaps-244e5d936e6c.json');

const confirm = process.argv.includes('--confirm');
const force   = process.argv.includes('--force');

function normalize(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function colLetter(i) {
  let s = '';
  for (let n = i; n >= 0; n = Math.floor(n / 26) - 1)
    s = String.fromCharCode(65 + (n % 26)) + s;
  return s;
}

function getSheets() {
  const auth = new google.auth.GoogleAuth({ keyFile: KEY_PATH, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
  return google.sheets({ version: 'v4', auth });
}

const lookupFlight = db.prepare(
  'SELECT speed, glide, turn, fade, stability FROM flight_numbers WHERE manufacturer_key = ? AND mold_key = ?'
);

async function main() {
  const sheets = getSheets();
  const resp   = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range:         `${SHEET_NAME}!A:X`,
  });
  const rows    = resp.data.values || [];
  if (rows.length < 2) { console.error('No data rows'); process.exit(1); }

  const headers = rows[0];
  const col     = name => headers.indexOf(name);

  const mfgCol       = col('Manufacturer');
  const moldCol      = col('Mold');
  const speedCol     = col('speed');
  const glideCol     = col('glide');
  const turnCol      = col('turn');
  const fadeCol      = col('fade');
  const stabilityCol = col('stability');

  if ([mfgCol, moldCol, speedCol, glideCol, turnCol, fadeCol, stabilityCol].includes(-1)) {
    const missing = ['Manufacturer', 'Mold', 'speed', 'glide', 'turn', 'fade', 'stability']
      .filter(h => col(h) === -1);
    console.error(`Missing headers: ${missing.join(', ')}\nFound: ${headers.join(', ')}`);
    process.exit(1);
  }

  const startCol = colLetter(speedCol);
  const endCol   = colLetter(stabilityCol);

  let matched = 0, notFound = 0, skipped = 0;
  const updates = [];

  for (let i = 1; i < rows.length; i++) {
    const row  = rows[i];
    const mfg  = (row[mfgCol]  || '').trim();
    const mold = (row[moldCol] || '').trim();
    if (!mfg && !mold) continue;

    const alreadyFilled = row[speedCol] && row[glideCol] && row[turnCol] && row[fadeCol] && row[stabilityCol];
    if (alreadyFilled && !force) { skipped++; continue; }

    const sheetRow = i + 1;
    const flight   = lookupFlight.get(normalize(mfg), normalize(mold));

    if (flight) {
      matched++;
      updates.push({ sheetRow, data: [flight.speed, flight.glide, flight.turn, flight.fade, flight.stability] });
      console.log(`  MATCH  row ${String(sheetRow).padEnd(4)} ${mfg} ${mold}  →  ${flight.speed}/${flight.glide}/${flight.turn}/${flight.fade}  stab:${flight.stability}`);
    } else {
      notFound++;
      console.log(`  MISS   row ${String(sheetRow).padEnd(4)} ${mfg} ${mold}`);
    }
  }

  console.log(`\nMatched: ${matched}  |  Not found: ${notFound}  |  Already filled (skipped): ${skipped}`);

  if (!confirm) {
    console.log(`\nDry run — pass --confirm to write ${updates.length} rows to ${startCol}:${endCol}`);
    return;
  }

  const data = updates.map(u => ({
    range:  `${SHEET_NAME}!${startCol}${u.sheetRow}:${endCol}${u.sheetRow}`,
    values: [u.data],
  }));

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { valueInputOption: 'USER_ENTERED', data },
  });
  console.log(`\nWrote flight numbers to ${updates.length} rows.`);
}

main().catch(err => { console.error(err.message); process.exit(1); });
