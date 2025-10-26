import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

function isValidPaystackSignature(rawBodyBuffer, signature, secret) {
  if (!signature || !secret) return false;
  const hmac = crypto.createHmac('sha512', secret).update(rawBodyBuffer).digest('hex');
  return hmac === signature;
}

async function getRawBody(req) {
  // if body already provided as string, return its raw bytes
  if (req.body && typeof req.body === 'string') return Buffer.from(req.body, 'utf8');
  // if running under a platform where req has buffer/rawBody, try that
  if (req.rawBody) return Buffer.isBuffer(req.rawBody) ? req.rawBody : Buffer.from(String(req.rawBody), 'utf8');
  // otherwise accumulate chunks from the incoming stream
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  try {
    const signature = req.headers['x-paystack-signature'] || req.headers['X-Paystack-Signature'];
    const secret = process.env.PAYSTACK_SECRET_KEY;
    const rawBodyBuffer = await getRawBody(req);
    const rawText = rawBodyBuffer.toString('utf8');

    if (!isValidPaystackSignature(rawBodyBuffer, signature, secret)) {
      console.warn('paystack-webhook: invalid signature');
      return res.status(400).send('invalid signature');
    }

    const event = JSON.parse(rawText);
    const eventType = event.event || event.type || (event.data && event.data.event);
    if (eventType !== 'charge.success' && eventType !== 'charge.successful' && event.event !== 'charge.success') {
      return res.status(200).json({ ok: true, message: 'ignored event', event: eventType });
    }

    const data = event.data || event;
    const metadata = data.metadata || {};
    const clientId = metadata.clientId || metadata.client_id || null;
    const packId = metadata.packId || metadata.pack_id || null;
    const reference = data.reference || data.tx_ref || data.reference;
    const amount = data.amount || data.requested_amount || null;

    const orderId = metadata.orderId || metadata.order_id || null;
    let order = null;

    if (orderId) {
      const { data: o, error: oErr } = await supabase.from('orders').select('*').eq('order_id', orderId).maybeSingle();
      if (!oErr) order = o;
    }
    if (!order && reference) {
      const { data: o2, error: oErr2 } = await supabase.from('orders').select('*').eq('paystack_reference', reference).maybeSingle();
      if (!oErr2) order = o2;
    }
    if (!order && clientId) {
      const { data: o3, error: oErr3 } = await supabase
        .from('orders')
        .select('*')
        .eq('client_id', clientId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!oErr3) order = o3;
    }

    const updatePayload = {
      status: 'paid',
      webhook_processed: true,
      paystack_reference: reference,
      paystack_payload: data,
      processed_at: new Date().toISOString()
    };

    if (order && order.order_id) {
      await supabase.from('orders').update(updatePayload).eq('order_id', order.order_id);
    } else {
      const newOrder = {
        order_id: orderId || `paystack_${reference}_${Date.now()}`,
        client_id: clientId || 'unknown',
        pack_id: packId || null,
        amount: amount || null,
        currency: data.currency || 'KES',
        payment_method: data.channel || 'card',
        status: 'paid',
        paystack_reference: reference,
        paystack_payload: data,
        webhook_processed: true,
        processed_at: new Date().toISOString(),
        created_at: new Date().toISOString()
      };
      const { error: insErr } = await supabase.from('orders').insert([newOrder]);
      if (insErr) console.warn('paystack-webhook: failed to insert new order', String(insErr));
    }

    // crediting (best-effort)
    let creditsToAdd = null;
    if (packId) {
      const { data: pack, error: packErr } = await supabase.from('credit_packs').select('credits').eq('id', packId).maybeSingle();
      if (!packErr && pack) creditsToAdd = pack.credits;
    }

    let credited = false;
    if (clientId && creditsToAdd != null) {
      try {
        const { data: rpcRes, error: rpcErr } = await supabase.rpc('increment_customer_credits', { client_id: clientId, credits: creditsToAdd });
        if (!rpcErr) credited = true;
      } catch (e) {
        console.warn('paystack-webhook: rpc call failed', String(e));
      }
    }

    if (!credited && clientId && creditsToAdd != null) {
      try {
        // safe read-modify-write fallback
        const { data: cust, error: custErr } = await supabase.from('customers').select('credits').eq('client_id', clientId).maybeSingle();
        if (!custErr && cust) {
          const newCredits = (Number(cust.credits) || 0) + Number(creditsToAdd);
          await supabase.from('customers').update({ credits: newCredits, updated_at: new Date().toISOString() }).eq('client_id', clientId);
          credited = true;
        }
      } catch (e) {
        console.warn('paystack-webhook: fallback credit update failed', String(e));
      }
    }

    return res.status(200).json({ ok: true, message: 'processed', orderId: order ? order.order_id : null, credited });
  } catch (err) {
    console.error('paystack-webhook top-level error', err && err.stack ? err.stack : String(err));
    return res.status(500).json({ ok: false, error: String(err) });
  }
}
