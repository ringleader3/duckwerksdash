#!/usr/bin/env node
// Usage: node scripts/test-rates.js
// Tests EasyPost rate fetch for a hardcoded address — edit as needed
require('dotenv').config();

const EASYPOST_API = 'https://api.easypost.com/v2';
const token = process.env.EASYPOST_LIVE_TOKEN;
const auth  = Buffer.from(token + ':').toString('base64');

const toAddress = {
  name:    'John Smith',
  street1: '123 Main St',
  city:    'Austin',
  state:   'TX',
  zip:     '78701',
  country: 'US',
};

async function main() {
  const res = await fetch(EASYPOST_API + '/shipments', {
    method:  'POST',
    headers: { Authorization: 'Basic ' + auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ shipment: {
      from_address: {
        name:    process.env.FROM_NAME,
        street1: process.env.FROM_STREET1,
        city:    process.env.FROM_CITY,
        state:   process.env.FROM_STATE,
        zip:     process.env.FROM_ZIP,
        country: 'US',
        phone:   process.env.FROM_PHONE,
      },
      to_address: toAddress,
      parcel: { weight: 16, length: 10, width: 8, height: 4 },
      options: { label_format: 'PDF', label_size: '4X6' },
    }}),
  });
  const data = await res.json();
  console.log('\n=== messages ===');
  console.log(JSON.stringify(data.messages, null, 2));
  console.log('\n=== rates ===');
  (data.rates || []).forEach(r => console.log(r.carrier, r.service, '$' + r.rate));
  if (!data.rates?.length) console.log('(no rates returned)');
}

main().catch(e => console.error(e.message));
