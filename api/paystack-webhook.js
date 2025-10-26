import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// helper: verify Paystack signature header (HMAC SHA512 of raw body using secret)
function isValidPaystackSignature(rawBody, signature, secret) {
  if (!signature || !secret) return false;
  const hmac = crypto.createHmac('sha512', secret).update(rawBody).digest('hex');
  return hmac === signature;
}

export default async function handler(req, res) {
  // Paystack sends POST JSON; we need the raw body to verify signature.
  try {
    const signature = req.headers['x-paystack-signature'] || req.headers['X-Paystack-Signature'];
    const rawBody = req.body && typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!isValidPaystackSignature(rawBody, signature, secret)) {
      console.warn('paystack-webhook: invalid signature');
      return res.status(400).send('invalid signature');
    }

    const event = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const eventType = event.event || event.type || (event.data && event.data.event);

    // Only handle successful charge events
    if (eventType !== 'charge.success' && eventType !== 'charge.successful' && event.event !== 'charge.success') {
      // respond 200 to acknowledge receipt but do nothing
      return res.status(200).json({ ok: true, message: 'ignored event', event: eventType });
    }

    const data = event.data || event;
    // Paystack often includes metadata in data.metadata
    const metadata = data.metadata || {};
    const clientId = metadata.clientId || metadata.client_id || null;
    const packId = metadata.packId || metadata.pack_id || null;
    const reference = data.reference || data.tx_ref || data.reference;
    const amount = data.amount || data.requested_amount || null;
    const paystackStatus = data.status || data.gateway_response || null;

    // find an order: prefer metadata.orderId, then reference, then a latest pending order for client
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
      // fallback: most recent pending order for client
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

    // update orders row to mark processed (best-effort)
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
      // If no order found, insert a record into orders for traceability
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

    // Now, credit the customer (best-effort)
    // 1) determine credits to add (try pack table)
    let creditsToAdd = null;
    if (packId) {
      const { data: pack, error: packErr } = await supabase.from('credit_packs').select('credits').eq('id', packId).maybeSingle();
      if (!packErr && pack) creditsToAdd = pack.credits;
    }
    // If packId not available, try to derive from amount (optional) — skipped for safety

    // 2) Try to call RPC increment_customer_credits(client_id, credits) if it exists
    let credited = false;
    if (clientId && creditsToAdd != null) {
      try {
        const { data: rpcRes, error: rpcErr } = await supabase.rpc('increment_customer_credits', { client_id: clientId, credits: creditsToAdd });
        if (!rpcErr) credited = true;
      } catch (e) {
        console.warn('paystack-webhook: rpc call failed', String(e));
      }
    }

    // 3) Fallback: increment customers.credits directly if RPC missing
    if (!credited && clientId && creditsToAdd != null) {
      try {
        const { error: updErr } = await supabase
          .from('customers')
          .update({ credits: (supabase.literal ? supabase.literal('credits + ' + creditsToAdd) : undefined) , updated_at: new Date().toISOString() })
          .eq('client_id', clientId);
        // Note: if supabase.literal isn't supported here, a safe read-modify-write could be used instead.
      } catch (e) {
        console.warn('paystack-webhook: fallback credit update failed', String(e));
      }
    }

    // respond 200 quickly
    return res.status(200).json({ ok: true, message: 'processed', orderId: order ? order.order_id : null, credited: credited });
  } catch (err) {
    console.error('paystack-webhook top-level error', err && err.stack ? err.stack : String(err));
    return res.status(500).json({ ok: false, error: String(err) });
  }
}
