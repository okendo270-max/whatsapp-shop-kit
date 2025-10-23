// api/webhook.js
import Stripe from 'stripe';
import { buffer } from 'micro';

export const config = { api: { bodyParser: false } };

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2022-11-15' });

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('Missing STRIPE_WEBHOOK_SECRET');
    return res.status(500).send('Webhook misconfigured');
  }

  let event;
  try {
    const buf = await buffer(req);
    event = stripe.webhooks.constructEvent(buf, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed.', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      // Retrieve full session with line items & customer expanded
      const full = await stripe.checkout.sessions.retrieve(session.id, {
        expand: ['line_items.data.price.product', 'customer']
      });

      const customerId = full.customer?.id || full.customer || session.customer;
      if (!customerId) {
        console.warn('No customer associated with checkout session', session.id);
      } else {
        // Sum credits from line items. Prefer product.metadata.credits if set.
        let creditsToAdd = 0;
        const items = full.line_items?.data || [];
        for (const li of items) {
          const product = li.price?.product;
          const prodCredits = product?.metadata?.credits;
          if (prodCredits) {
            creditsToAdd += parseInt(prodCredits, 10) * (li.quantity || 1);
          } else {
            // fallback: treat 1 quantity as 1 credit
            creditsToAdd += (li.quantity || 1);
          }
        }

        // retrieve current customer metadata
        const cust = await stripe.customers.retrieve(customerId);
        const existing = parseInt((cust.metadata && cust.metadata.credits) || '0', 10);
        const newCredits = existing + creditsToAdd;

        // preserve other metadata, update credits
        const newMeta = Object.assign({}, cust.metadata || {}, { credits: String(newCredits) });
        await stripe.customers.update(customerId, { metadata: newMeta });

        console.log(`Credited customer ${customerId} with ${creditsToAdd} credits (total ${newCredits})`);
      }
    }
    // respond 200
    res.json({ received: true });
  } catch (err) {
    console.error('Webhook handler failure', err);
    res.status(500).send('Webhook handling error');
  }
}
