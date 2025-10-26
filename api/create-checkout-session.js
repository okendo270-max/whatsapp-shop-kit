cat > api/create-checkout-session.js <<'EOF'
/**
 * create-checkout-session.js
 *
 * Behaviour:
 * - If PAYSTACK_SECRET_KEY is present, proxy the request to /api/create-paystack-payment
 * - Otherwise use the original Stripe flow (unchanged)
 */

import Stripe from 'stripe';

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2022-11-15' }) : null;

async function proxyToPaystack(req, res) {
  try {
    // ensure we send the same JSON body to the paystack endpoint
    const fetchUrl = (process.env.BASE_URL || '') + '/api/create-paystack-payment';
    const r = await fetch(fetchUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body || {})
    });
    const text = await r.text();
    try {
      const json = JSON.parse(text);
      return res.status(r.status).json(json);
    } catch (e) {
      // non-json response: return raw text
      return res.status(r.status).send(text);
    }
  } catch (err) {
    console.error('proxy to paystack failed', err);
    return res.status(500).json({ error: 'proxy_failed', detail: String(err) });
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // If Paystack is configured prefer it (useful for your Kenya flow)
  if (process.env.PAYSTACK_SECRET_KEY) {
    return proxyToPaystack(req, res);
  }

  // Fallback: existing Stripe flow
  if (!stripe) return res.status(500).json({ error: 'No payment provider configured' });

  try {
    const { clientId, customerId } = req.body || {};

    // Create or reuse customer
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

    // Price id must be set in env STRIPE_PRICE_ID
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
EOF

