#!/usr/bin/env node
// scripts/seed-flight-numbers.js
// Usage: node scripts/seed-flight-numbers.js [--csv <path>]
// Upserts flight numbers from CSV into the flight_numbers SQLite table.
// Safe to re-run — uses INSERT OR REPLACE.

const fs   = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const db   = require('../server/db');

const csvPath = (() => {
  const i = process.argv.indexOf('--csv');
  return i >= 0 ? process.argv[i + 1] : path.join(__dirname, '..', 'docs', 'tmp', 'all_discs.csv');
})();

function normalize(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

const upsert = db.prepare(`
  INSERT OR REPLACE INTO flight_numbers
    (manufacturer_key, mold_key, manufacturer, mold, speed, glide, turn, fade, stability)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const csvText = fs.readFileSync(csvPath, 'utf8');
const records = parse(csvText, { columns: true, skip_empty_lines: true, bom: true });

const run = db.transaction(() => {
  let inserted = 0;
  for (const r of records) {
    if (!r.manufacturer || !r.name) continue;
    upsert.run(
      normalize(r.manufacturer),
      normalize(r.name),
      r.manufacturer,
      r.name,
      parseFloat(r.speed)     || null,
      parseFloat(r.glide)     || null,
      parseFloat(r.turn)      || null,
      parseFloat(r.fade)      || null,
      parseFloat(r.stability) || null,
    );
    inserted++;
  }
  return inserted;
});

const count = run();
console.log(`Seeded ${count} discs from ${csvPath}`);
