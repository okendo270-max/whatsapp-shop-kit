// api/credits.js
import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2022-11-15' });

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { customerId } = req.query;
  if (!customerId) return res.status(400).json({ error: 'Missing customerId' });

  try {
    const cust = await stripe.customers.retrieve(customerId);
    const credits = parseInt((cust.metadata && cust.metadata.credits) || '0', 10);
    return res.json({ credits });
  } catch (err) {
    console.error('credits error', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
