#!/usr/bin/env node
// Seed disc_plastics table from plastic_base_seed_list.txt
// Usage: node scripts/seed-plastics.js [--confirm]

const fs      = require('fs');
const path    = require('path');
const Database = require('better-sqlite3');

const DRY_RUN  = !process.argv.includes('--confirm');
const TXT_PATH = path.join(__dirname, '..', 'plastic_base_seed_list.txt');
const DB_PATH  = path.join(__dirname, '..', 'data', 'duckwerks.db');

function normalize(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// Known manufacturer display names — blank lines separate sections in the source
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
  const lines   = txt.split('\n').map(l => l.trim()).filter(Boolean);
  const records = [];

  let manufacturer = null;
  let tier         = null;

  // The file has a TOC + full content duplicated. Find the 3rd "Innova" which is
  // the first occurrence in the actual data section (after the TOC list).
  let innovaCount = 0;
  let dataStart   = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === 'Innova') {
      innovaCount++;
      if (innovaCount === 3) { dataStart = i; break; }
    }
  }

  for (let i = dataStart; i < lines.length; i++) {
    const line = lines[i].replace(/&amp;/g, '&');

    if (KNOWN_MANUFACTURERS.has(line)) {
      manufacturer = line;
      tier = null;
      continue;
    }

    // Handle the combined MVP/Axiom/Streamline header
    if (line.includes('MVP Disc Sports') && line.includes('Axiom')) {
      manufacturer = 'MVP Disc Sports';
      tier = null;
      continue;
    }

    if (line === 'Premium' || line.startsWith('Premium ')) {
      tier = 'Premium';
      continue;
    }

    if (line === 'Baseline' || line.startsWith('Baseline ') || line.startsWith('All discs')) {
      tier = 'Baseline';
      continue;
    }

    if (!manufacturer || !tier) continue;

    // Skip nav/footer lines
    if (line.startsWith('Click') || line.startsWith('If you have') || line.includes('@')) continue;

    records.push({ manufacturer, plastic: line, tier });
  }

  // Axiom and Streamline share MVP's plastics
  const mvp = records.filter(r => r.manufacturer === 'MVP Disc Sports');
  for (const alias of ['Axiom Discs', 'Streamline Discs']) {
    for (const r of mvp) {
      records.push({ ...r, manufacturer: alias });
    }
  }

  return records;
}

const txt     = fs.readFileSync(TXT_PATH, 'utf8');
const records = parse(txt);

console.log(`Parsed ${records.length} plastic records`);

// Preview
const byMfg = {};
for (const r of records) {
  if (!byMfg[r.manufacturer]) byMfg[r.manufacturer] = [];
  byMfg[r.manufacturer].push(`  [${r.tier}] ${r.plastic}`);
}
for (const [mfg, plastics] of Object.entries(byMfg)) {
  console.log(`\n${mfg} (${plastics.length})`);
  plastics.forEach(p => console.log(p));
}

if (DRY_RUN) {
  console.log('\nDry run — pass --confirm to write to DB');
  process.exit(0);
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

const insert = db.prepare(
  'INSERT OR REPLACE INTO disc_plastics (manufacturer_key, manufacturer, plastic, tier) VALUES (?, ?, ?, ?)'
);

const insertMany = db.transaction(rows => {
  for (const r of rows) {
    insert.run(normalize(r.manufacturer), r.manufacturer, r.plastic, r.tier);
  }
});

insertMany(records);
console.log(`\nInserted ${records.length} rows into disc_plastics`);
