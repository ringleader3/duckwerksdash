const express = require('express');
const router = express.Router();

const AIRTABLE_API = 'https://api.airtable.com/v0';

function airtableHeaders() {
  const pat = process.env.AIRTABLE_PAT;
  if (!pat) throw new Error('AIRTABLE_PAT not configured');
  return {
    'Authorization': `Bearer ${pat}`,
    'Content-Type': 'application/json',
  };
}

// Generic GET — handles pagination, field filters, etc.
router.get('/*', async (req, res) => {
  const query = new URLSearchParams(req.query).toString();
  const url = `${AIRTABLE_API}/${req.params[0]}${query ? '?' + query : ''}`;
  try {
    const response = await fetch(url, { headers: airtableHeaders() });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (e) {
    res.status(502).json({ error: 'Airtable request failed', detail: e.message });
  }
});

// PATCH — update record fields
router.patch('/*', async (req, res) => {
  const url = `${AIRTABLE_API}/${req.params[0]}`;
  try {
    const response = await fetch(url, {
      method: 'PATCH',
      headers: airtableHeaders(),
      body: JSON.stringify(req.body),
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (e) {
    res.status(502).json({ error: 'Airtable request failed', detail: e.message });
  }
});

// POST — create record
router.post('/*', async (req, res) => {
  const url = `${AIRTABLE_API}/${req.params[0]}`;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: airtableHeaders(),
      body: JSON.stringify(req.body),
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (e) {
    res.status(502).json({ error: 'Airtable request failed', detail: e.message });
  }
});

module.exports = router;
