#!/usr/bin/env node
// Usage: node scripts/check-aspects.js [categoryId] [aspectName]
// Prints valid eBay aspect values for a category (defaults to Disc Golf Discs)
// Examples:
//   node scripts/check-aspects.js                        # all aspects for 184356
//   node scripts/check-aspects.js 184356 Brand           # Brand values only
//   node scripts/check-aspects.js 184356 "Disc Type"     # Disc Type values only
require('dotenv').config();
const { getAppToken } = require('../server/ebay-auth');
const EBAY_API = 'https://api.ebay.com';

async function main() {
  const categoryId  = process.argv[2] || '184356';
  const filterAspect = process.argv[3] || null;

  const token = await getAppToken();
  const url = `${EBAY_API}/commerce/taxonomy/v1/category_tree/0/get_item_aspects_for_category?categoryId=${categoryId}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();

  const aspects = data.aspects;
  if (!aspects) { console.log('No aspects found:', JSON.stringify(data, null, 2)); return; }

  const list = filterAspect
    ? aspects.filter(a => a.localizedAspectName.toLowerCase() === filterAspect.toLowerCase())
    : aspects;

  for (const aspect of list) {
    const values = aspect.aspectValues?.map(v => v.localizedValue) || [];
    const mode   = aspect.aspectConstraint?.aspectMode || '';
    const req    = aspect.aspectConstraint?.aspectRequired ? ' [REQUIRED]' : '';
    console.log(`\n${aspect.localizedAspectName}${req} (${mode})`);
    if (values.length) {
      values.forEach(v => console.log(`  ${v}`));
    } else {
      console.log('  (free-form)');
    }
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });
