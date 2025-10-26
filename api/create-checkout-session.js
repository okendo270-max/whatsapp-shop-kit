/**
 * create-checkout-session.js
 * Robust proxy: prefer Paystack by calling the absolute Vercel host first.
 * Falls back to other approaches if needed, then falls back to Stripe.
 */
import Stripe from 'stripe';

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2022-11-15' }) : null;

async function tryFetch(url, body) {
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    });
    const text = await r.text();
    try {
      const json = JSON.parse(text);
      return { ok: true, status: r.status, json };
    } catch (e) {
      return { ok: true, status: r.status, json: { raw: text } };
    }
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

async function proxyToPaystack(req, res) {
  const body = req.body || {};
  const candidates = [];

  // 1) Hardcoded absolute Vercel domain first (your production/test domain)
  candidates.push('https://whatsapp-shop-kit.vercel.app/api/create-paystack-payment');

  // 2) explicit BASE_URL env if present
  if (process.env.BASE_URL) candidates.push((process.env.BASE_URL || '').replace(/\\/+\$/, '') + '/api/create-paystack-payment');

  // 3) vercel provided domain (VERCEL_URL)
  if (process.env.VERCEL_URL) candidates.push('https://' + process.env.VERCEL_URL + '/api/create-paystack-payment');

  // 4) relative path fallback
  candidates.push('/api/create-paystack-payment');

  let lastErr = null;
  for (const url of candidates) {
    if (!url) continue;
    const attempt = await tryFetch(url, body);
    if (attempt.ok) {
      return res.status(attempt.status).json(attempt.json);
    }
    lastErr = attempt.error || 'unknown';
  }

  console.error('proxy to paystack failed, lastErr=', lastErr, 'tried=', candidates);
  return res.status(502).json({ error: 'proxy_failed', detail: String(lastErr), tried: candidates });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (process.env.PAYSTACK_SECRET_KEY) {
    return proxyToPaystack(req, res);
  }

  if (!stripe) return res.status(500).json({ error: 'No payment provider configured' });

  try {
    const { clientId, customerId } = req.body || {};
    let customer = null;
    if (customerId) {
      try {
        customer = await stripe.customers.retrieve(customerId);
      } catch (e) {
        customer = null;
      }
    }
    if (!customer || customer.deleted) {
      customer = await stripe.customers.create({
        metadata: { client_id: clientId || '' }
      });
    }
    const priceId = process.env.STRIPE_PRICE_ID;
    if (!priceId) return res.status(500).json({ error: 'Missing STRIPE_PRICE_ID' });

    const session = await stripe.checkout.sessions.create({
      customer: customer.id,
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.SUCCESS_URL || ''}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: process.env.CANCEL_URL || ''
    });

    return res.json({ url: session.url, customerId: customer.id });
  } catch (err) {
    console.error('create-checkout-session error', err);
    return res.status(500).json({ error: 'Server error', detail: String(err) });
  }
}
