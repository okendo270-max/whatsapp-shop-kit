// api/use-credit.js
import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2022-11-15' });

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { customerId, amount = 1 } = req.body || {};
    if (!customerId) return res.status(400).json({ error: 'Missing customerId' });

    // fetch customer
    const cust = await stripe.customers.retrieve(customerId);
    const current = parseInt((cust.metadata && cust.metadata.credits) || '0', 10);
    if (current < amount) {
      return res.status(402).json({ error: 'Insufficient credits', credits: current });
    }
    const newCredits = current - amount;
    const newMeta = Object.assign({}, cust.metadata || {}, { credits: String(newCredits) });
    await stripe.customers.update(customerId, { metadata: newMeta });
    return res.json({ success: true, credits: newCredits });
  } catch (err) {
    console.error('use-credit error', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
