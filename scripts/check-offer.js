#!/usr/bin/env node
// Usage: node scripts/check-offer.js DWG-014
require('dotenv').config();
const { getAccessToken } = require('../server/ebay-auth');

const sku = process.argv[2];
if (!sku) { console.error('Usage: node scripts/check-offer.js <sku>'); process.exit(1); }

async function main() {
  const token = await getAccessToken();
  const res = await fetch(
    `https://api.ebay.com/sell/inventory/v1/offer?sku=${encodeURIComponent(sku)}&marketplace_id=EBAY_US`,
    { headers: { Authorization: `Bearer ${token}`, 'Accept-Language': 'en-US', 'Content-Language': 'en-US' } }
  );
  const data = await res.json();
  const offer = data.offers?.[0];
  if (!offer) { console.log('No offer found for', sku); console.log('Raw response:', JSON.stringify(data, null, 2)); return; }
  console.log('offerId:        ', offer.offerId);
  console.log('status:         ', offer.status);
  console.log('bestOfferTerms: ', JSON.stringify(offer.bestOfferTerms));
  console.log('pricingSummary: ', JSON.stringify(offer.pricingSummary));
}

main().catch(e => { console.error(e.message); process.exit(1); });
