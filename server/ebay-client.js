// server/ebay-client.js — shared eBay Inventory API client
const { getAccessToken } = require('./ebay-auth');

const EBAY_API   = 'https://api.ebay.com';
const EBAY_MEDIA = 'https://apim.ebay.com/commerce/media/v1_beta';
const MARKETPLACE = 'EBAY_US';

let _merchantLocationKey = null;

async function ebayHeaders() {
  const token = await getAccessToken();
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    'Content-Language': 'en-US',
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

async function getMerchantLocationKey(headers) {
  if (_merchantLocationKey) return _merchantLocationKey;
  const res  = await fetch(`${EBAY_API}/sell/inventory/v1/location`, { headers });
  const data = await res.json();
  if (data.locations?.length > 0) {
    _merchantLocationKey = data.locations[0].merchantLocationKey;
    return _merchantLocationKey;
  }
  const key         = 'duckwerks1';
  const postHeaders = { ...headers };
  delete postHeaders['Content-Language'];
  const created = await fetch(`${EBAY_API}/sell/inventory/v1/location/${key}`, {
    method: 'POST',
    headers: postHeaders,
    body: JSON.stringify({
      location: {
        address: {
          addressLine1:    process.env.FROM_STREET1,
          city:            process.env.FROM_CITY,
          stateOrProvince: process.env.FROM_STATE,
          postalCode:      process.env.FROM_ZIP,
          country:         process.env.FROM_COUNTRY || 'US',
        },
      },
      locationTypes: ['WAREHOUSE'],
      name:          'Duckwerks',
    }),
  });
  if (!created.ok) {
    const err = await created.text();
    throw new Error(`merchant location create failed: ${err}`);
  }
  _merchantLocationKey = key;
  return _merchantLocationKey;
}

async function uploadToEPS(buffer, filename) {
  const token    = await getAccessToken();
  const formData = new FormData();
  formData.set('image', new Blob([buffer], { type: 'image/jpeg' }), filename);
  const uploadRes = await fetch(`${EBAY_MEDIA}/image/create_image_from_file`, {
    method:  'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body:    formData,
  });
  if (uploadRes.status !== 201) {
    const text = await uploadRes.text();
    throw new Error(`EPS upload failed for ${filename} (${uploadRes.status}): ${text.slice(0, 200)}`);
  }
  const location = uploadRes.headers.get('Location');
  if (!location) throw new Error(`EPS upload for ${filename}: no Location header in 201 response`);
  const getRes  = await fetch(location, { headers: { 'Authorization': `Bearer ${token}` } });
  const getText = await getRes.text();
  if (!getRes.ok) throw new Error(`EPS getImage failed for ${filename} (${getRes.status}): ${getText.slice(0, 200)}`);
  return JSON.parse(getText).imageUrl;
}

async function getInventoryItem(sku, headers) {
  const res = await fetch(`${EBAY_API}/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`, { headers });
  if (!res.ok) return null;
  return res.json();
}

async function putInventoryItem(sku, body, headers) {
  const res = await fetch(
    `${EBAY_API}/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`,
    { method: 'PUT', headers, body: JSON.stringify(body) }
  );
  if (res.status !== 200 && res.status !== 204) {
    const text = await res.text();
    throw new Error(`inventory_item PUT ${res.status}: ${text}`);
  }
}

async function getOfferBySku(sku, headers) {
  const res  = await fetch(`${EBAY_API}/sell/inventory/v1/offer?sku=${encodeURIComponent(sku)}`, { headers });
  const data = await res.json();
  return data.offers?.[0] || null;
}

// POST offer; if 25002 (already exists) → PUT the existing offer instead
async function upsertOffer(offerBody, headers) {
  const res  = await fetch(`${EBAY_API}/sell/inventory/v1/offer`, {
    method: 'POST', headers, body: JSON.stringify(offerBody),
  });
  const data = await res.json();
  if (!res.ok) {
    const existing = data.errors?.find(e => e.errorId === 25002 && e.parameters?.find(p => p.name === 'offerId'));
    if (existing) {
      const offerId = existing.parameters.find(p => p.name === 'offerId').value;
      const patch   = await fetch(`${EBAY_API}/sell/inventory/v1/offer/${offerId}`, {
        method: 'PUT', headers, body: JSON.stringify(offerBody),
      });
      if (!patch.ok) {
        const patchData = await patch.json();
        throw new Error(`offer PUT ${patch.status}: ${JSON.stringify(patchData)}`);
      }
      return offerId;
    }
    throw new Error(`offer POST ${res.status}: ${JSON.stringify(data)}`);
  }
  return data.offerId;
}

async function updateOffer(offerId, offerBody, headers) {
  const res = await fetch(`${EBAY_API}/sell/inventory/v1/offer/${offerId}`, {
    method: 'PUT', headers, body: JSON.stringify(offerBody),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`offer PUT ${res.status}: ${text}`);
  }
}

async function publishOffer(offerId, headers) {
  const attempt = async () => {
    const res  = await fetch(`${EBAY_API}/sell/inventory/v1/offer/${offerId}/publish`, {
      method: 'POST', headers,
    });
    const data = await res.json();
    if (!res.ok) throw Object.assign(new Error(`offer publish ${res.status}: ${JSON.stringify(data)}`), { data });
    return data.listingId;
  };
  try {
    return await attempt();
  } catch (e) {
    if (e.data?.errors?.some(err => err.errorId === 25604)) {
      await new Promise(r => setTimeout(r, 3000));
      return await attempt();
    }
    throw e;
  }
}

module.exports = {
  ebayHeaders,
  fetchPolicies,
  getMerchantLocationKey,
  uploadToEPS,
  getInventoryItem,
  putInventoryItem,
  getOfferBySku,
  upsertOffer,
  updateOffer,
  publishOffer,
  MARKETPLACE,
};
