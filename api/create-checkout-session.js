// api/create-checkout-session.js
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2022-11-15' });

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

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
      success_url: `${process.env.SUCCESS_URL}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: process.env.CANCEL_URL
    });

    return res.json({ url: session.url, customerId: customer.id });

  } catch (err) {
    console.error('create-checkout-session error', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
