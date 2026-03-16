const express = require('express');
const router = express.Router();

const REVERB_API = 'https://api.reverb.com/api';

function reverbHeaders() {
  const pat = process.env.REVERB_PAT;
  if (!pat) throw new Error('REVERB_PAT not configured');
  return {
    'Authorization': `Bearer ${pat}`,
    'Accept': 'application/hal+json',
    'Accept-Version': '3.0',
    'Content-Type': 'application/json',
  };
}

router.get('/*', async (req, res) => {
  const path = req.params[0];
  const query = new URLSearchParams(req.query).toString();
  const url = `${REVERB_API}/${path}${query ? '?' + query : ''}`;
  try {
    const response = await fetch(url, { headers: reverbHeaders() });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (e) {
    res.status(502).json({ error: 'Reverb request failed', detail: e.message });
  }
});

router.post('/*', async (req, res) => {
  const path = req.params[0];
  const url = `${REVERB_API}/${path}`;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: reverbHeaders(),
      body: JSON.stringify(req.body),
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (e) {
    res.status(502).json({ error: 'Reverb request failed', detail: e.message });
  }
});

module.exports = router;
