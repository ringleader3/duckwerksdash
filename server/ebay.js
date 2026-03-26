const express = require('express');
const router  = express.Router();
const { getAccessToken, authRedirectUrl, exchangeCodeForTokens, writeTokens } = require('./ebay-auth');

const EBAY_API = 'https://api.ebay.com';

// Map EasyPost carrier names to eBay carrier codes
const EBAY_CARRIER_CODES = {
  'USPS':  'USPS',
  'UPS':   'UPS',
  'FedEx': 'FEDEX',
  'DHL':   'DHL',
};

async function ebayHeaders() {
  const token = await getAccessToken();
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
    'Accept-Language': 'en-US',
  };
}

// ── OAuth setup routes ────────────────────────────────────────────────────────

// Step 1: visit in browser — redirects to eBay consent page
router.get('/auth', (req, res) => {
  res.redirect(authRedirectUrl());
});

// Step 2: eBay redirects to duckwerks.com/ebay-oauth-callback.php which shows
// the code. Run the curl command shown there to hit this endpoint and save tokens.
router.post('/auth/exchange', async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'Missing code' });
  try {
    const tokens = await exchangeCodeForTokens(code);
    writeTokens({
      access_token:  tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at:    Date.now() + tokens.expires_in * 1000,
    });
    res.json({ ok: true, message: 'eBay authorization complete.' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Fulfillment routes ────────────────────────────────────────────────────────

// GET /api/ebay/orders — orders awaiting fulfillment
// Filter passed as raw string — URLSearchParams would encode { } | which eBay rejects
router.get('/orders', async (req, res) => {
  try {
    const headers  = await ebayHeaders();
    const url      = `${EBAY_API}/sell/fulfillment/v1/order?filter=orderfulfillmentstatus:{NOT_STARTED|IN_PROGRESS}&limit=50`;
    const response = await fetch(url, { headers });
    const data     = await response.json();
    res.status(response.status).json(data);
  } catch (e) {
    res.status(502).json({ error: 'eBay orders request failed', detail: e.message });
  }
});

// GET /api/ebay/orders/:id — single order (address + payout lookup)
router.get('/orders/:id', async (req, res) => {
  try {
    const headers  = await ebayHeaders();
    const response = await fetch(
      `${EBAY_API}/sell/fulfillment/v1/order/${encodeURIComponent(req.params.id)}`,
      { headers }
    );
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (e) {
    res.status(502).json({ error: 'eBay order request failed', detail: e.message });
  }
});

// GET /api/ebay/listings — all active listings with title + price via Inventory API
// Flow: get all inventory items (has title+sku), then bulk-fetch offers by sku (has price+listingId)
router.get('/listings', async (req, res) => {
  try {
    const headers = await ebayHeaders();
    const limit   = 25;

    // Step 1: fetch all inventory items (paginated) — gives us sku + title
    let allItems = [];
    let offset = 0;
    while (true) {
      const r    = await fetch(`${EBAY_API}/sell/inventory/v1/inventory_item?limit=${limit}&offset=${offset}`, { headers });
      const data = await r.json();
      if (!r.ok) throw new Error(`eBay inventory HTTP ${r.status}: ${JSON.stringify(data)}`);
      allItems = allItems.concat(data.inventoryItems || []);
      if (allItems.length >= (data.total || 0)) break;
      offset += limit;
    }

    if (!allItems.length) return res.json({ listings: [] });

    // Step 2: bulk-fetch offers in batches of 25 — gives us price + listingId per sku
    const skus = allItems.map(i => i.sku);
    let allOffers = [];
    for (let i = 0; i < skus.length; i += 25) {
      const batch = skus.slice(i, i + 25);
      const r     = await fetch(`${EBAY_API}/sell/inventory/v1/bulk_get_offers`, {
        method:  'POST',
        headers,
        body:    JSON.stringify({ requests: batch.map(sku => ({ sku })) }),
      });
      const data  = await r.json();
      if (!r.ok) throw new Error(`eBay bulk offers HTTP ${r.status}: ${JSON.stringify(data)}`);
      for (const resp of data.responses || []) {
        allOffers = allOffers.concat(resp.offers || []);
      }
    }

    // Join: title from inventory item, price+listingId from offer
    const titleBySku = {};
    for (const item of allItems) titleBySku[item.sku] = item.product?.title || item.sku;

    const listings = allOffers
      .filter(o => o.listing?.listingStatus === 'ACTIVE')
      .map(o => ({
        offerId:      o.offerId,
        sku:          o.sku,
        legacyItemId: String(o.listing?.listingId || ''),
        title:        titleBySku[o.sku] || o.sku,
        price:        parseFloat(o.pricingSummary?.price?.value) || 0,
      }));

    res.json({ listings });
  } catch (e) {
    console.error('eBay listings error:', e.message);
    res.status(502).json({ error: 'eBay listings request failed', detail: e.message });
  }
});

// POST /api/ebay/orders/:id/tracking — push tracking, marks order shipped
router.post('/orders/:id/tracking', async (req, res) => {
  const { id } = req.params;
  const { lineItemId, quantity, trackingNumber, shippingCarrierCode } = req.body;
  const ebayCarrier = EBAY_CARRIER_CODES[shippingCarrierCode] || shippingCarrierCode;
  try {
    const headers  = await ebayHeaders();
    const response = await fetch(
      `${EBAY_API}/sell/fulfillment/v1/order/${encodeURIComponent(id)}/shipping_fulfillment`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          lineItems:           [{ lineItemId, quantity: quantity || 1 }],
          trackingNumber,
          shippingCarrierCode: ebayCarrier,
          shippedDate:         new Date().toISOString(),
        }),
      }
    );
    // 201 = success, no response body
    if (response.status === 201) return res.status(201).json({ ok: true });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (e) {
    res.status(502).json({ error: 'eBay tracking push failed', detail: e.message });
  }
});

module.exports = router;
