#!/usr/bin/env node
// One-time script to withdraw sold eBay offers
const { getAccessToken } = require('../server/ebay-auth');

const items = [
  { sku: 'DWG-013', offerId: '146307154011' },
  { sku: 'DWG-021', offerId: '146307516011' },
  { sku: 'DWG-036', offerId: '146984482011' },
  { sku: 'DWG-051', offerId: '146984990011' },
  { sku: 'DWG-057', offerId: '148417564011' },
];

(async () => {
  const token = await getAccessToken();
  for (const { sku, offerId } of items) {
    const r = await fetch(`https://api.ebay.com/sell/inventory/v1/offer/${offerId}/withdraw`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
        'Accept-Language': 'en-US',
      },
    });
    const body = await r.text();
    console.log(sku, r.status, body.slice(0, 200));
  }
})();
