#!/usr/bin/env node
// One-time migration: create disc_plastics table and seed from plastic_base_seed_list.txt
// Run on NUC after deploy: node scripts/migrate-plastics-table.js

const fs       = require('fs');
const path     = require('path');
const Database = require('better-sqlite3');

const TXT_PATH = path.join(__dirname, '..', 'plastic_base_seed_list.txt');
const DB_PATH  = path.join(__dirname, '..', 'data', 'duckwerks.db');

function normalize(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

const KNOWN_MANUFACTURERS = new Set([
  'Innova', 'Discraft', 'MVP Disc Sports', 'Axiom Discs', 'Streamline Discs',
  'Dynamic Discs', 'Latitude 64°', 'Westside Discs', 'Discmania', 'Prodigy Discs',
  'Kastaplast', 'Gateway Disc Sports', 'Legacy Discs', 'RPM Discs', 'Mint Discs',
  'Yikun Discs', 'Viking Discs', 'Thought Space Athletics', 'Above Ground Level (AGL)',
  'Alfa Discs', 'Birdie Disc Golf Supply Co', 'Clash Discs', 'Daredevil Discs',
  'Disctroyer Discs', 'Divergent Discs', 'Doomsday Discs', 'EV-7 Discs',
  'Finish Line Discs', 'Hooligan Discs', 'Hyzer Bomb Discs', 'Loft Discs',
  'Lone Star Discs', 'Prodiscus', 'Elevation Discs', 'Vibram', '3C Discs',
  'Meridian Discs', 'Lightning Discs',
]);

function parse(txt) {
  const lines   = txt.split('\n').map(l => l.trim().replace(/&amp;/g, '&')).filter(Boolean);
  const records = [];
  let manufacturer = null, tier = null, innovaCount = 0, dataStart = 0;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === 'Innova') { innovaCount++; if (innovaCount === 3) { dataStart = i; break; } }
  }

  for (let i = dataStart; i < lines.length; i++) {
    const line = lines[i];
    if (KNOWN_MANUFACTURERS.has(line)) { manufacturer = line; tier = null; continue; }
    if (line.includes('MVP Disc Sports') && line.includes('Axiom')) { manufacturer = 'MVP Disc Sports'; tier = null; continue; }
    if (line === 'Premium' || line.startsWith('Premium ')) { tier = 'Premium'; continue; }
    if (line === 'Baseline' || line.startsWith('Baseline ') || line.startsWith('All discs')) { tier = 'Baseline'; continue; }
    if (!manufacturer || !tier) continue;
    if (line.startsWith('Click') || line.startsWith('If you have') || line.includes('@')) continue;
    records.push({ manufacturer, plastic: line, tier });
  }

  const mvp = records.filter(r => r.manufacturer === 'MVP Disc Sports');
  for (const alias of ['Axiom Discs', 'Streamline Discs']) {
    for (const r of mvp) records.push({ ...r, manufacturer: alias });
  }
  return records;
}

const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS disc_plastics (
    manufacturer_key  TEXT NOT NULL,
    manufacturer      TEXT NOT NULL,
    plastic           TEXT NOT NULL,
    tier              TEXT NOT NULL CHECK(tier IN ('Premium', 'Baseline')),
    PRIMARY KEY (manufacturer_key, plastic)
  )
`);

const existing = db.prepare('SELECT COUNT(*) as n FROM disc_plastics').get();
if (existing.n > 0) {
  console.log(`disc_plastics already has ${existing.n} rows — skipping seed`);
  process.exit(0);
}

const txt     = fs.readFileSync(TXT_PATH, 'utf8');
const records = parse(txt);
const insert  = db.prepare('INSERT OR REPLACE INTO disc_plastics (manufacturer_key, manufacturer, plastic, tier) VALUES (?, ?, ?, ?)');
const insertMany = db.transaction(rows => { for (const r of rows) insert.run(normalize(r.manufacturer), r.manufacturer, r.plastic, r.tier); });
insertMany(records);
console.log(`Created disc_plastics and inserted ${records.length} rows`);
