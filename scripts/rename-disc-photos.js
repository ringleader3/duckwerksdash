#!/usr/bin/env node
// scripts/rename-disc-photos.js — rename raw disc photos to DWG-{id}-{n}.jpeg
// Usage: node scripts/rename-disc-photos.js --dir <path> --start <id> [--per 3] [--dry-run]
//
// Sorts files by creation time, groups them --per at a time, renames sequentially.
// Example: 9 photos starting at disc 12 → DWG-12-1.jpeg, DWG-12-2.jpeg, DWG-12-3.jpeg,
//                                          DWG-13-1.jpeg, DWG-13-2.jpeg, DWG-13-3.jpeg, ...

const fs   = require('fs');
const path = require('path');

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}

const dir    = arg('--dir');
const startId = parseInt(arg('--start'), 10);
const perDisc = parseInt(arg('--per') || '3', 10);
const dryRun  = process.argv.includes('--dry-run');

if (!dir || isNaN(startId)) {
  console.error('Usage: node scripts/rename-disc-photos.js --dir <path> --start <id> [--per 3] [--dry-run]');
  process.exit(1);
}

// Find all jpeg/jpg files, sort by creation time
const files = fs.readdirSync(dir)
  .filter(f => /\.(jpe?g|heic|png)$/i.test(f))
  .map(f => ({ name: f, born: fs.statSync(path.join(dir, f)).birthtime }))
  .sort((a, b) => a.born - b.born)
  .map(f => f.name);

if (files.length === 0) {
  console.error(`No image files found in ${dir}`);
  process.exit(1);
}

if (files.length % perDisc !== 0) {
  console.warn(`Warning: ${files.length} files is not evenly divisible by ${perDisc} (${Math.ceil(files.length / perDisc)} discs, last disc will have ${files.length % perDisc} photo(s))`);
}

if (dryRun) console.log(`\nDRY RUN — no files will be renamed\n`);

let discId = startId;
let photoNum = 1;

for (const file of files) {
  const ext    = '.jpeg';
  const newName = `DWG-${discId}-${photoNum}${ext}`;
  const src    = path.join(dir, file);
  const dest   = path.join(dir, newName);

  console.log(`${file.padEnd(40)} → ${newName}`);
  if (!dryRun) fs.renameSync(src, dest);

  photoNum++;
  if (photoNum > perDisc) {
    photoNum = 1;
    discId++;
  }
}

const discCount = Math.ceil(files.length / perDisc);
console.log(`\n${dryRun ? 'Would rename' : 'Renamed'} ${files.length} files across ${discCount} disc${discCount !== 1 ? 's' : ''} (IDs ${startId}–${discId - (photoNum === 1 ? 1 : 0)})`);
