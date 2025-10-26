import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

function normalizePhone(raw) {
  if (!raw) return null;
  let s = String(raw).trim().replace(/[^\d]/g, '');
  if (s.length === 10 && s.startsWith('0')) s = '254' + s.slice(1);
  if (s.length === 9) s = '254' + s;
  if (s.startsWith('254')) return '+' + s;
  return '+' + s;
}

function emailFromPhone(phone) {
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
    if (packErr) return res.status(500).json({ error: 'fetch_pack_error', detail: String(packErr) });
    if (!pack) return res.status(404).json({ error: 'pack not found' });

    // fetch customer: select only existing columns (no 'email' column)
    const { data: customer, error: custErr } = await supabase
      .from('customers')
      .select('client_id, phone, mpesa_phone, paystack_customer_id')
      .eq('client_id', clientId)
      .maybeSingle();
    if (custErr) return res.status(500).json({ error: 'fetch_customer_error', detail: String(custErr) });

    const customerPhone = phone || (customer && (customer.mpesa_phone || customer.phone)) || null;
    const normalizedPhone = normalizePhone(customerPhone);
    const customerEmail = bodyEmail || (customer && customer.email) || emailFromPhone(normalizedPhone);

    const priceFloat = Number(pack.price);
    if (Number.isNaN(priceFloat)) return res.status(400).json({ error: 'invalid pack.price' });
    const amountSubunit = Math.round(priceFloat * 100);

    // create pending order
    const orderId = `order_${Date.now()}_${clientId}`;
    await supabase.from('orders').insert([{
      order_id: orderId,
      client_id: clientId,
      pack_id: pack.id,
      amount: priceFloat,
      currency: pack.currency,
      payment_method: paymentMethod === 'mpesa' ? 'mpesa' : 'card',
      status: 'pending',
      created_at: new Date().toISOString()
    }]);

    // mpesa via Paystack Charge API
    if (paymentMethod === 'mpesa') {
      if (!normalizedPhone) return res.status(400).json({ error: 'phone required for mpesa payments' });
      const chargeBody = {
        email: customerEmail,
        amount: amountSubunit,
        currency: pack.currency || 'KES',
        metadata: { clientId, packId, orderId, provider: pack.provider || 'internal' },
        mobile_money: { provider: 'mpesa', phone: normalizedPhone }
      };
      const r = await fetch('https://api.paystack.co/charge', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(chargeBody)
      });
      const text = await r.text();
      let result;
      try { result = JSON.parse(text); } catch (e) { result = { raw: text }; }
      await supabase.from('orders').update({ paystack_response: result, updated_at: new Date().toISOString() }).eq('order_id', orderId);
      if (!result) return res.status(500).json({ error: 'no response from paystack' });
      if (result.status === false) return res.status(400).json({ error: 'paystack_error', detail: result });
      return res.status(200).json({ ok: true, flow: 'mpesa-paystack', orderId, paystack: result });
    }

    // card flow
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
      headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(initPayload)
    });
    const txText = await r2.text();
    let tx;
    try { tx = JSON.parse(txText); } catch (e) { tx = { raw: txText }; }
    await supabase.from('orders').update({ paystack_response: tx, paystack_reference: reference, updated_at: new Date().toISOString() }).eq('order_id', orderId);
    if (!tx || tx.status === false) return res.status(500).json({ error: 'paystack_init_failed', detail: tx });
    return res.status(200).json({ ok: true, flow: 'card-paystack', orderId, paystack: tx });
  } catch (err) {
    console.error('create-paystack-payment error', err && err.stack ? err.stack : String(err));
    return res.status(500).json({ error: 'server_error', detail: String(err) });
  }
}
