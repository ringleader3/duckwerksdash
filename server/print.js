// ── Print proxy — sends ZPL directly to Zebra printer via raw TCP (port 9100) ──
// Requires ZEBRA_PRINTER_IP in .env, e.g.:
//   ZEBRA_PRINTER_IP=192.168.1.50
//   ZEBRA_PRINTER_PORT=9100  (optional, default 9100)
const express = require('express');
const net     = require('net');
const router  = express.Router();

const ZEBRA_IP   = process.env.ZEBRA_PRINTER_IP;
const ZEBRA_PORT = parseInt(process.env.ZEBRA_PRINTER_PORT || '9100', 10);

function sendZpl(zplData) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    socket.setTimeout(5000);
    socket.connect(ZEBRA_PORT, ZEBRA_IP, () => {
      socket.write(zplData, () => socket.end());
    });
    socket.on('close', resolve);
    socket.on('timeout', () => { socket.destroy(); reject(new Error('Printer connection timed out')); });
    socket.on('error', reject);
  });
}

// POST /api/print/label — { url: string (ZPL URL) }
router.post('/label', async (req, res) => {
  if (!ZEBRA_IP) return res.status(503).json({ error: 'ZEBRA_PRINTER_IP not configured' });
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'url required' });
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Failed to fetch ZPL: ${r.status}`);
    const zpl = await r.text();
    await sendZpl(zpl);
    res.json({ ok: true });
  } catch (e) {
    console.error('[print/label]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/print/status
router.get('/status', (_req, res) => {
  res.json({ configured: !!ZEBRA_IP, ip: ZEBRA_IP || null, port: ZEBRA_PORT });
});

module.exports = router;
