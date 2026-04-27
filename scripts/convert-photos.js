#!/usr/bin/env node
// scripts/convert-photos.js — convert HEIC photos to sized JPEGs for eBay listings
//
// Usage: node scripts/convert-photos.js --dir <path> [--date YYYYMMDD] [--confirm]
//
// Reads all HEIC/JPEG/PNG files from --dir, converts to JPEG (2000px long edge, q80),
// writes to a dated session folder: DW-YYYYMMDD/ (or DW-YYYYMMDD-2/ etc. if taken)
// Originals are untouched.

const fs   = require('fs');
const path = require('path');
const sharp = require('sharp');

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}

const inputDir = arg('--dir');
const confirm  = process.argv.includes('--confirm');

if (!inputDir) {
  console.error('Usage: node scripts/convert-photos.js --dir <path> [--date YYYYMMDD] [--confirm]');
  process.exit(1);
}

if (!fs.existsSync(inputDir)) {
  console.error(`Directory not found: ${inputDir}`);
  process.exit(1);
}

// Date: explicit arg or today
const rawDate = arg('--date') || new Date().toISOString().slice(0, 10).replace(/-/g, '');
if (!/^\d{8}$/.test(rawDate)) {
  console.error('--date must be YYYYMMDD (e.g. 20260422)');
  process.exit(1);
}

// Find an available session folder name
const parentDir = path.dirname(path.resolve(inputDir));
function sessionDir(suffix) {
  const name = suffix === 1 ? `DW-${rawDate}` : `DW-${rawDate}-${suffix}`;
  return path.join(parentDir, name);
}
let suffix = 1;
while (fs.existsSync(sessionDir(suffix))) suffix++;
const outDir = sessionDir(suffix);

// Collect input files
const files = fs.readdirSync(inputDir)
  .filter(f => /\.(heic|jpg|jpeg|png)$/i.test(f))
  .map(f => ({ name: f, born: fs.statSync(path.join(inputDir, f)).birthtime }))
  .sort((a, b) => a.born - b.born)
  .map(f => f.name);

if (files.length === 0) {
  console.error(`No image files found in ${inputDir}`);
  process.exit(1);
}

const sessionName = path.basename(outDir);
const pad = n => String(n).padStart(2, '0');

console.log(`\n${confirm ? '' : 'DRY RUN — pass --confirm to write.\n'}`);
console.log(`Input:  ${inputDir} (${files.length} files)`);
console.log(`Output: ${outDir}\n`);

const plan = files.map((f, i) => ({
  src: path.join(inputDir, f),
  dest: path.join(outDir, `${sessionName}-${pad(i + 1)}.jpeg`),
  original: f,
}));

for (const { original, dest } of plan) {
  console.log(`  ${original.padEnd(40)} → ${path.basename(dest)}`);
}

if (!confirm) {
  console.log(`\nWould write ${files.length} files to ${outDir}/`);
  process.exit(0);
}

fs.mkdirSync(outDir, { recursive: true });

(async () => {
  let ok = 0, fail = 0;
  for (const { src, dest, original } of plan) {
    try {
      await sharp(src)
        .rotate()                          // apply EXIF orientation
        .resize(2000, 2000, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toFile(dest);
      const kb = Math.round(fs.statSync(dest).size / 1024);
      console.log(`  ✓ ${original} → ${path.basename(dest)} (${kb}KB)`);
      ok++;
    } catch (e) {
      console.error(`  ✗ ${original}: ${e.message}`);
      fail++;
    }
  }
  console.log(`\nDone: ${ok} converted, ${fail} failed → ${outDir}/`);
})();
