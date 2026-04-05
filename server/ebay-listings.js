// server/ebay-listings.js — POST /api/ebay/bulk-list
const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const db      = require('./db');
const { getAccessToken } = require('./ebay-auth');

const EBAY_API    = 'https://api.ebay.com';
const PHOTOS_DIR  = path.join(__dirname, '..', 'public', 'dg-photos');
const PHOTOS_BASE = 'https://dash.duckwerks.com/dg-photos';
const DG_CATEGORY = '26441'; // eBay disc golf category — verify on first dry-run
const MARKETPLACE = 'EBAY_US';

if (!fs.existsSync(PHOTOS_DIR)) fs.mkdirSync(PHOTOS_DIR, { recursive: true });

const upload = multer({ storage: multer.memoryStorage() });

async function ebayHeaders() {
  const token = await getAccessToken();
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    'X-EBAY-C-MARKETPLACE-ID': MARKETPLACE,
    'Accept-Language': 'en-US',
  };
}

async function fetchPolicies(headers) {
  const [fp, rp, pp] = await Promise.all([
    fetch(`${EBAY_API}/sell/account/v1/fulfillment_policy?marketplace_id=${MARKETPLACE}`, { headers }).then(r => r.json()),
    fetch(`${EBAY_API}/sell/account/v1/return_policy?marketplace_id=${MARKETPLACE}`, { headers }).then(r => r.json()),
    fetch(`${EBAY_API}/sell/account/v1/payment_policy?marketplace_id=${MARKETPLACE}`, { headers }).then(r => r.json()),
  ]);
  const fulfillmentPolicyId = fp.fulfillmentPolicies?.[0]?.fulfillmentPolicyId;
  const returnPolicyId      = rp.returnPolicies?.[0]?.returnPolicyId;
  const paymentPolicyId     = pp.paymentPolicies?.[0]?.paymentPolicyId;
  if (!fulfillmentPolicyId || !returnPolicyId || !paymentPolicyId) {
    throw new Error('No eBay business policies found. Enable them at Seller Hub > Account > Business policies.');
  }
  return { fulfillmentPolicyId, returnPolicyId, paymentPolicyId };
}

function buildDescription(disc) {
  const lines = [];
  if (disc.manufacturer) lines.push(`Brand: ${disc.manufacturer}`);
  if (disc.mold)         lines.push(`Mold: ${disc.mold}`);
  if (disc.type)         lines.push(`Type: ${disc.type}`);
  if (disc.plastic)      lines.push(`Plastic: ${disc.plastic}`);
  if (disc.run)          lines.push(`Run/Edition: ${disc.run}`);
  if (disc.weight)       lines.push(`Weight: ${disc.weight}g`);
  if (disc.notes)        lines.push(`\nNotes: ${disc.notes}`);
  return lines.join('\n');
}

function savePhotos(files) {
  const urls = [];
  for (const file of files) {
    const dest = path.join(PHOTOS_DIR, file.originalname);
    if (!fs.existsSync(dest)) fs.writeFileSync(dest, file.buffer);
    urls.push(`${PHOTOS_BASE}/${file.originalname}`);
  }
  return urls;
}

async function putInventoryItem(sku, disc, photoUrls, headers) {
  const condition = disc.condition === 'Unthrown' ? 'NEW' : 'USED';
  const body = {
    product: {
      title:       disc.title.slice(0, 80),
      description: buildDescription(disc),
      imageUrls:   photoUrls,
      aspects: {
        ...(disc.manufacturer && { Brand:          [disc.manufacturer] }),
        ...(disc.mold         && { Model:          [disc.mold] }),
        ...(disc.plastic      && { 'Plastic Type': [disc.plastic] }),
        ...(disc.weight       && { Weight:         [`${disc.weight}g`] }),
      },
    },
    condition,
    availability: { shipToLocationAvailability: { quantity: 1 } },
  };
  const res = await fetch(
    `${EBAY_API}/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`,
    { method: 'PUT', headers, body: JSON.stringify(body) }
  );
  if (res.status !== 200 && res.status !== 204) {
    const text = await res.text();
    throw new Error(`inventory_item PUT ${res.status}: ${text}`);
  }
}

async function createOffer(sku, disc, policies, headers) {
  const body = {
    sku,
    marketplaceId:      MARKETPLACE,
    format:             'FIXED_PRICE',
    listingPolicies: {
      fulfillmentPolicyId: policies.fulfillmentPolicyId,
      returnPolicyId:      policies.returnPolicyId,
      paymentPolicyId:     policies.paymentPolicyId,
    },
    pricingSummary: {
      price: { value: String(disc.listPrice), currency: 'USD' },
    },
    categoryId:         DG_CATEGORY,
    listingDescription: buildDescription(disc),
  };
  const res  = await fetch(`${EBAY_API}/sell/inventory/v1/offer`, {
    method: 'POST', headers, body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`offer POST ${res.status}: ${JSON.stringify(data)}`);
  return data.offerId;
}

async function publishOffer(offerId, headers) {
  const res  = await fetch(`${EBAY_API}/sell/inventory/v1/offer/${offerId}/publish`, {
    method: 'POST', headers,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`offer publish ${res.status}: ${JSON.stringify(data)}`);
  return data.listingId;
}

function dbWrite(disc, listingId) {
  // Idempotent: skip if platform_listing_id already exists (handles crash-before-CSV-write)
  const existing = db.prepare(
    'SELECT id FROM listings WHERE platform_listing_id = ?'
  ).get(String(listingId));
  if (existing) return;

  // Ensure Disc Golf category exists
  let cat = db.prepare("SELECT id FROM categories WHERE name = 'Disc Golf'").get();
  if (!cat) {
    const r = db.prepare(
      "INSERT INTO categories (name, color, badge_class) VALUES ('Disc Golf', '#4ade80', 'badge-green')"
    ).run();
    cat = { id: r.lastInsertRowid };
  }

  const ebaySite = db.prepare("SELECT id FROM sites WHERE name = 'eBay'").get();
  if (!ebaySite) throw new Error('eBay site not found in DB — run server once to seed');

  const item = db.prepare(
    "INSERT INTO items (name, status, category_id, cost) VALUES (?, 'Listed', ?, 0)"
  ).run(disc.title, cat.id);

  db.prepare(
    'INSERT INTO listings (item_id, site_id, platform_listing_id, list_price, url) VALUES (?, ?, ?, ?, ?)'
  ).run(item.lastInsertRowid, ebaySite.id, String(listingId), disc.listPrice, `https://ebay.com/itm/${listingId}`);
}

router.post('/bulk-list', upload.any(), async (req, res) => {
  let disc;
  try {
    disc = JSON.parse(req.body.disc);
  } catch {
    return res.status(400).json({ error: 'Invalid disc JSON in request body' });
  }

  try {
    const headers   = await ebayHeaders();
    const policies  = await fetchPolicies(headers);
    const sku       = `DWG-${String(disc.id).padStart(3, '0')}`;
    const photoUrls = savePhotos(req.files || []);

    await putInventoryItem(sku, disc, photoUrls, headers);
    const offerId   = await createOffer(sku, disc, policies, headers);
    const listingId = await publishOffer(offerId, headers);

    dbWrite(disc, listingId);

    res.json({ discId: disc.id, sku, listingId, url: `https://ebay.com/itm/${listingId}` });
  } catch (e) {
    // Return error per-disc — script logs and continues
    res.json({ discId: disc?.id, error: e.message });
  }
});

module.exports = router;
