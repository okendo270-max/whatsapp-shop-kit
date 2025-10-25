import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

function normalizePhone(raw) {
  if (!raw) return null;
  let s = String(raw).trim();
  // remove non-digits and leading plus
  s = s.replace(/[^\d]/g, '');
  // if starts with 0 -> replace with 254
  if (s.length === 10 && s.startsWith('0')) s = '254' + s.slice(1);
  // if starts with 9-digit local without leading zero but 9-digit (unlikely), handle conservatively
  if (s.length === 9) s = '254' + s;
  // if it already starts with 254 leave as is
  if (s.startsWith('254')) return '+' + s;
  // if it looks like international already, prepend +
  return '+' + s;
}

function emailFromPhone(phone) {
  // deterministic, not random — safe fallback when customer has no email
  // example: +254700000001 -> 254700000001@noemail.paystack
  if (!phone) return null;
  const digits = phone.replace(/[^\d]/g, '');
  return `${digits}@noemail.paystack`;
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { clientId, packId, email: bodyEmail, phone: bodyPhone, paymentMethod = 'card' } = req.body || {};

    if (!clientId || !packId) return res.status(400).json({ error: 'clientId and packId required' });

    // fetch pack
    const { data: pack, error: packErr } = await supabase
      .from('credit_packs')
      .select('id, price, currency, credits, provider')
      .eq('id', packId)
      .maybeSingle();

    if (packErr) throw packErr;
    if (!pack) return res.status(404).json({ error: 'pack not found' });

    // fetch customer (email and phone optional)
    const { data: customer, error: custErr } = await supabase
      .from('customers')
      .select('client_id, email, phone')
      .eq('client_id', clientId)
      .maybeSingle();

    if (custErr) throw custErr;

    const customerPhone = bodyPhone || (customer && customer.phone) || null;
    const normalizedPhone = normalizePhone(customerPhone);
    const customerEmail = bodyEmail || (customer && customer.email) || emailFromPhone(normalizedPhone);

    const priceFloat = Number(pack.price);
    if (Number.isNaN(priceFloat)) return res.status(400).json({ error: 'invalid pack.price' });

    // Paystack requires amount in the smallest currency subunit (kobo for KES)
    const amountSubunit = Math.round(priceFloat * 100);

    // Create an order row first (status pending)
    const orderId = `order_${Date.now()}_${clientId}`;
    const orderPayload = {
      order_id: orderId,
      client_id: clientId,
      pack_id: pack.id,
      amount: priceFloat,
      currency: pack.currency,
      payment_method: paymentMethod === 'mpesa' ? 'mpesa' : 'card',
      status: 'pending',
      created_at: new Date().toISOString()
    };

    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .insert([orderPayload])
      .select('*')
      .maybeSingle();

    if (orderErr) throw orderErr;

    // MPESA via Paystack Charge API
    if (paymentMethod === 'mpesa') {
      if (!normalizedPhone) {
        return res.status(400).json({ error: 'phone required for mpesa payments' });
      }

      // Build Paystack Charge payload
      const chargeBody = {
        email: customerEmail,
        amount: amountSubunit,
        currency: pack.currency || 'KES',
        metadata: { clientId, packId, orderId, provider: pack.provider || 'internal' },
        mobile_money: {
          provider: 'mpesa',
          phone: normalizedPhone
        }
      };

      const r = await fetch('https://api.paystack.co/charge', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(chargeBody)
      });

      const result = await r.json();

      // store last response on the order for traceability (best effort)
      await supabase
        .from('orders')
        .update({ paystack_response: result, updated_at: new Date().toISOString() })
        .eq('order_id', orderId);

      if (!result) return res.status(500).json({ error: 'no response from paystack' });
      if (result.status === false) return res.status(400).json({ error: 'paystack_error', detail: result });

      // return the charge response to the client
      return res.status(200).json({ ok: true, flow: 'mpesa-paystack', order, paystack: result });
    }

    // Card flow: initialize transaction (redirect) - keep previous transaction init behaviour
    if (!customerEmail) return res.status(400).json({ error: 'Missing email for card payments' });

    const reference = `paystack_${Date.now()}_${clientId}`;
    const initPayload = {
      email: customerEmail,
      amount: amountSubunit,
      currency: pack.currency || 'KES',
      reference,
      callback_url: `${process.env.BASE_URL || ''}/paystack-return.html`,
      metadata: { clientId, packId, orderId, provider: pack.provider || 'internal' }
    };

    const r2 = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(initPayload)
    });

    const tx = await r2.json();

    // store paystack init response
    await supabase
      .from('orders')
      .update({ paystack_response: tx, paystack_reference: reference, updated_at: new Date().toISOString() })
      .eq('order_id', orderId);

    if (!tx || tx.status === false) {
      return res.status(500).json({ error: 'paystack_init_failed', detail: tx });
    }

    return res.status(200).json({ ok: true, flow: 'card-paystack', order, paystack: tx.data });
  } catch (err) {
    console.error('create-paystack-payment error', err);
    return res.status(500).json({ error: 'server_error', detail: String(err) });
  }
}
