#!/usr/bin/env node
// Usage: node scripts/check-conditions.js <categoryId>
// Prints valid eBay condition values for a category
require('dotenv').config();
const { getAccessToken } = require('../server/ebay-auth');
const EBAY_API = 'https://api.ebay.com';

async function main() {
  const categoryId = process.argv[2] || '184356';
  const token = await getAccessToken();
  const url = `${EBAY_API}/sell/metadata/v1/marketplace/EBAY_US/get_item_condition_policies?filter=categoryId:%7B${categoryId}%7D`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
  const data = await res.json();
  const conditions = data.itemConditionPolicies?.[0]?.itemConditions;
  if (!conditions) { console.log('No conditions found:', JSON.stringify(data, null, 2)); return; }
  conditions.forEach(c => console.log(`${c.conditionId}  ${c.conditionDescription}`));
}

main().catch(e => { console.error(e.message); process.exit(1); });
