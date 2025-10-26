export default async function handler(req, res) {
  try {
    // Try the absolute Vercel domain directly (same target as production proxy)
    const target = 'https://whatsapp-shop-kit.vercel.app/api/create-paystack-payment';
    const r = await fetch(target, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body || {})
    });
    const text = await r.text();
    try { return res.status(r.status).json(JSON.parse(text)); } catch(e) { return res.status(r.status).send(text); }
  } catch (err) {
    // Return full error message and stack to client for debugging
    return res.status(500).json({ debug_error: String(err), stack: err && err.stack ? err.stack : null });
  }
}
