// server/ebay-listings.js — POST /api/ebay/bulk-list
const express = require('express');
const router  = express.Router();
const multer  = require('multer');

const upload = multer({ storage: multer.memoryStorage() });

router.post('/bulk-list', upload.any(), async (req, res) => {
  res.json({ ok: true, message: 'bulk-list stub' });
});

module.exports = router;
