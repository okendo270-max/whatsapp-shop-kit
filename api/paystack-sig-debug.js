// api/paystack-sig-debug.js
// POST a JSON body and this returns { sig: "<hex-hmac>" } computed by server secret.
// Do NOT leave deployed permanently; remove once debugging is done.

import crypto from 'crypto';
import { supabaseAdmin } from './_supabase.js'; // harmless import check; adjust if necessary

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', err => reject(err));
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, message: 'POST only' });

  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) return res.status(500).json({ ok: false, message: 'PAYSTACK_SECRET_KEY not set on server' });

  try {
    const raw = await getRawBody(req); // raw body bytes, exactly as received
    const sig = crypto.createHmac('sha512', secret).update(raw).digest('hex');
    // Return the server-computed HMAC only (not the secret). You can compare with your local HMAC.
    return res.status(200).json({ ok: true, sig });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err) });
  }
}
