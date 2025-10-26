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
  console.log('[create-paystack-payment] invoked', { method: req.method });
  try {
    if (req.method !== 'POST') {
      console.log('[create-paystack-payment] wrong method');
      return res.status(405).json({ ok: false, step: 'method', message: 'Method not allowed' });
    }

    const body = req.body || {};
    console.log('[create-paystack-payment] body', body);

    const { clientId, packId, email: bodyEmail, phone: bodyPhone, paymentMethod = 'card' } = body;

    if (!clientId || !packId) {
      console.log('[create-paystack-payment] missing clientId or packId', { clientId, packId });
      return res.status(400).json({ ok: false, step: 'input', message: 'clientId and packId required' });
    }

    // 1) fetch pack
    let pack;
    try {
      const { data, error } = await supabase
        .from('credit_packs')
        .select('id, price, currency, credits, provider')
        .eq('id', packId)
        .maybeSingle();
      if (error) throw error;
      pack = data;
    } catch (e) {
      console.error('[create-paystack-payment] pack fetch error', String(e));
      return res.status(500).json({ ok: false, step: 'fetch_pack', error: String(e) });
    }
    if (!pack) {
      console.log('[create-paystack-payment] pack not found', { packId });
      return res.status(404).json({ ok: false, step: 'pack_not_found', packId });
    }
    console.log('[create-paystack-payment] pack', pack);

    // 2) fetch customer (optional fields)
    let customer = null;
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('client_id, email, phone')
        .eq('client_id', clientId)
        .maybeSingle();
      if (error) throw error;
      customer = data;
    } catch (e) {
      console.error('[create-paystack-payment] customer fetch error', String(e));
      return res.status(500).json({ ok: false, step: 'fetch_customer', error: String(e) });
    }
    console.log('[create-paystack-payment] customer', customer);

    const customerPhone = bodyPhone || (customer && customer.phone) || null;
    const normalizedPhone = normalizePhone(customerPhone);
    const customerEmail = bodyEmail || (customer && customer.email) || emailFromPhone(normalizedPhone);

    const priceFloat = Number(pack.price);
    if (Number.isNaN(priceFloat)) {
      console.log('[create-paystack-payment] invalid pack.price', { price: pack.price });
      return res.status(400).json({ ok: false, step: 'invalid_price', price: pack.price });
    }
    const amountSubunit = Math.round(priceFloat * 100);

    // 3) create pending order
    let order;
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

    try {
      const { data, error } = await supabase
        .from('orders')
        .insert([orderPayload])
        .select('*')
        .maybeSingle();
      if (error) throw error;
      order = data;
    } catch (e) {
      console.error('[create-paystack-payment] order insert error', String(e));
      return res.status(500).json({ ok: false, step: 'insert_order', error: String(e) });
    }

    console.log('[create-paystack-payment] created order', { orderId });

    // 4) handle mpesa via Paystack
    if (paymentMethod === 'mpesa') {
      console.log('[create-paystack-payment] mpesa flow start', { normalizedPhone, customerEmail });
      if (!normalizedPhone) {
        console.log('[create-paystack-payment] no phone for mpesa');
        return res.status(400).json({ ok: false, step: 'mpesa_no_phone', message: 'phone required for mpesa' });
      }

      if (!process.env.PAYSTACK_SECRET_KEY) {
        console.log('[create-paystack-payment] missing PAYSTACK_SECRET_KEY');
        return res.status(500).json({ ok: false, step: 'missing_env', message: 'PAYSTACK_SECRET_KEY missing' });
      }

      const chargeBody = {
        email: customerEmail,
        amount: amountSubunit,
        currency: pack.currency || 'KES',
        metadata: { clientId, packId, orderId, provider: pack.provider || 'internal' },
        mobile_money: { provider: 'mpesa', phone: normalizedPhone }
      };

      try {
        console.log('[create-paystack-payment] calling Paystack charge', { chargeBody: { amount: chargeBody.amount, currency: chargeBody.currency } });
        const r = await fetch('https://api.paystack.co/charge', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(chargeBody)
        });
        const text = await r.text();
        let result;
        try { result = JSON.parse(text); } catch (e) { result = { raw: text }; }
        console.log('[create-paystack-payment] paystack response', { status: r.status, result });
        // store paystack response
        await supabase.from('orders').update({ paystack_response: result, updated_at: new Date().toISOString() }).eq('order_id', orderId);
        return res.status(200).json({ ok: true, step: 'mpesa_called', order, paystack: result });
      } catch (e) {
        console.error('[create-paystack-payment] paystack charge error', String(e));
        await supabase.from('orders').update({ paystack_response: { error: String(e) }, updated_at: new Date().toISOString() }).eq('order_id', orderId);
        return res.status(500).json({ ok: false, step: 'paystack_charge', error: String(e) });
      }
    }

    // 5) card flow via Paystack transaction initialize
    console.log('[create-paystack-payment] card flow start', { customerEmail });
    if (!customerEmail) {
      console.log('[create-paystack-payment] missing email for card');
      return res.status(400).json({ ok: false, step: 'card_no_email', message: 'Missing email for card payments' });
    }

    if (!process.env.PAYSTACK_SECRET_KEY) {
      console.log('[create-paystack-payment] missing PAYSTACK_SECRET_KEY for card flow');
      return res.status(500).json({ ok: false, step: 'missing_env', message: 'PAYSTACK_SECRET_KEY missing' });
    }

    const reference = `paystack_${Date.now()}_${clientId}`;
    const initPayload = {
      email: customerEmail,
      amount: amountSubunit,
      currency: pack.currency || 'KES',
      reference,
      callback_url: `${process.env.BASE_URL || ''}/paystack-return.html`,
      metadata: { clientId, packId, orderId, provider: pack.provider || 'internal' }
    };

    try {
      console.log('[create-paystack-payment] calling paystack initialize', { reference, amount: initPayload.amount });
      const r2 = await fetch('https://api.paystack.co/transaction/initialize', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(initPayload)
      });
      const text2 = await r2.text();
      let tx;
      try { tx = JSON.parse(text2); } catch (e) { tx = { raw: text2 }; }
      console.log('[create-paystack-payment] paystack init response', { status: r2.status, tx });
      await supabase.from('orders').update({ paystack_response: tx, paystack_reference: reference, updated_at: new Date().toISOString() }).eq('order_id', orderId);
      return res.status(200).json({ ok: true, step: 'card_initialized', order, paystack: tx });
    } catch (e) {
      console.error('[create-paystack-payment] paystack init error', String(e));
      await supabase.from('orders').update({ paystack_response: { error: String(e) }, updated_at: new Date().toISOString() }).eq('order_id', orderId);
      return res.status(500).json({ ok: false, step: 'paystack_init', error: String(e) });
    }
  } catch (err) {
    console.error('[create-paystack-payment] top-level error', err && err.stack ? err.stack : String(err));
    return res.status(500).json({ ok: false, step: 'top_level', error: String(err) });
  }
}
