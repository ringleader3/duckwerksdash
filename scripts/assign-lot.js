#!/usr/bin/env node
// scripts/assign-lot.js — bulk-assign items to a lot by category name
// Usage: node scripts/assign-lot.js --lot-id <id> --category <name> [--api <url>] [--confirm]
//
// Defaults to dry-run. Pass --confirm to actually write.

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}

const lotId    = arg('--lot-id');
const category = arg('--category');
const apiBase  = arg('--api') || 'http://localhost:3000';
const confirm  = process.argv.includes('--confirm');

if (!lotId || !category) {
  console.error('Usage: node scripts/assign-lot.js --lot-id <id> --category <name> [--api <url>] [--confirm]');
  process.exit(1);
}

async function main() {
  const res = await fetch(`${apiBase}/api/items`);
  if (!res.ok) throw new Error(`GET /api/items failed: ${res.status}`);
  const items = await res.json();

  const matches = items.filter(item =>
    item.category?.name?.toLowerCase() === category.toLowerCase() &&
    !item.lot
  );

  if (matches.length === 0) {
    console.log(`No unassigned items found in category "${category}".`);
    return;
  }

  console.log(`${confirm ? 'Assigning' : '[DRY RUN] Would assign'} ${matches.length} item(s) to lot ${lotId}:`);
  for (const item of matches) {
    console.log(`  [${item.id}] ${item.name}`);
  }

  if (!confirm) {
    console.log('\nRe-run with --confirm to apply.');
    return;
  }

  let done = 0, failed = 0;
  for (const item of matches) {
    const patch = await fetch(`${apiBase}/api/items/${item.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ lot_id: parseInt(lotId, 10) }),
    });
    if (patch.ok) {
      done++;
    } else {
      console.error(`  FAILED [${item.id}] ${item.name} — ${patch.status}`);
      failed++;
    }
  }

  console.log(`\nDone: ${done} assigned, ${failed} failed`);
}

main().catch(e => { console.error(e.message); process.exit(1); });
