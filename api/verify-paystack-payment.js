// api/verify-paystack-payment.js
// Server endpoint to verify a Paystack reference and finalise the order.
// Assumes server-side Supabase admin client exported from ./_supabase.js as `supabaseAdmin`.
// Env needed: PAYSTACK_SECRET_KEY, SUPABASE_SERVICE_KEY, SUPABASE_URL

import { supabaseAdmin } from './_supabase.js'; // adjust if your helper exports differently

function jsonResponse(res, status, body) {
  res.status(status).json(body);
}

export default async function handler(req, res) {
  if (!['GET','POST'].includes(req.method)) {
    return jsonResponse(res, 405, { ok: false, message: 'Method not allowed' });
  }

  const reference = (req.method === 'GET')
    ? req.query?.reference || req.query?.ref || null
    : (req.body?.reference || req.body?.ref || null);

  if (!reference) {
    return jsonResponse(res, 400, { ok: false, message: 'Missing reference' });
  }

  const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;
  if (!PAYSTACK_SECRET) {
    console.error('PAYSTACK_SECRET_KEY not set');
    return jsonResponse(res, 500, { ok: false, message: 'Server misconfigured' });
  }

  // Call Paystack verify API
  let paystackResp;
  try {
    const url = `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`;
    const r = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${PAYSTACK_SECRET}`,
        'Accept': 'application/json'
      }
    });
    paystackResp = await r.json();
  } catch (err) {
    console.error('Paystack verify request failed', err);
    return jsonResponse(res, 502, { ok: false, message: 'Failed to contact Paystack' });
  }

  if (!paystackResp || !paystackResp.status) {
    console.warn('Paystack verify returned non-success shape', paystackResp);
    return jsonResponse(res, 502, { ok: false, message: 'Invalid Paystack response', paystackResp });
  }

  if (!paystackResp.data || (paystackResp.data.status !== 'success' && paystackResp.data.gateway_response !== 'Approval')) {
    return jsonResponse(res, 200, { ok: true, verified: false, paystack: paystackResp });
  }

  const data = paystackResp.data;
  const meta = data.metadata ?? {};
  const clientId = meta.clientId ?? meta.client_id ?? null;
  const creditsFromMeta = meta.credits ?? meta.credits_amount ?? null;
  const referenceFound = data.reference ?? reference;

  // record verify call (idempotent-ish)
  try {
    await supabaseAdmin.from('payment_events')
      .insert([{
        event_id: `verify-${referenceFound}-${Date.now()}`,
        reference: referenceFound,
        event_type: 'verify',
        raw_payload: data
      }], { returning: 'minimal' });
  } catch (err) {
    if (!err?.details || !err.details.includes('already exists')) {
      console.warn('payment_events insert (verify) error, continuing', err);
    }
  }

  // locate order (tries multiple strategies)
  let order = null;
  try {
    if (referenceFound) {
      const { data: o1, error: o1err } = await supabaseAdmin
        .from('orders').select('*').eq('paystack_reference', referenceFound).limit(1).maybeSingle();
      if (!o1err && o1) order = o1;
    }
    if (!order && referenceFound) {
      const { data: o2, error: o2err } = await supabaseAdmin
        .from('orders').select('*').eq('order_id', referenceFound).limit(1).maybeSingle();
      if (!o2err && o2) order = o2;
    }
    if (!order && referenceFound) {
      const { data: o3, error: o3err } = await supabaseAdmin
        .from('orders').select('*').filter("payload->>reference", "eq", referenceFound).limit(1).maybeSingle();
      if (!o3err && o3) order = o3;
    }
    if (!order && clientId) {
      const { data: o4, error: o4err } = await supabaseAdmin
        .from('orders').select('*').eq('client_id', clientId).eq('status', 'pending')
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (!o4err && o4) order = o4;
    }
  } catch (err) {
    console.error('Order lookup error', err);
    return jsonResponse(res, 500, { ok: false, message: 'DB lookup failed' });
  }

  if (!order) {
    return jsonResponse(res, 200, { ok: true, verified: true, note: 'order-not-found', paystack: paystackResp });
  }

  if (order.webhook_processed === true || order.status === 'completed') {
    return jsonResponse(res, 200, { ok: true, verified: true, note: 'already-processed', order });
  }

  const updates = {
    status: 'completed',
    webhook_processed: true,
    processed_at: new Date().toISOString(),
    payload: data
  };
  if (!order.paystack_reference && referenceFound) updates.paystack_reference = referenceFound;

  const orderKeyColumn = order.order_id ? 'order_id' : 'id';
  const orderKey = order.order_id ?? order.id;

  const { error: updErr } = await supabaseAdmin
    .from('orders')
    .update(updates)
    .eq(orderKeyColumn, orderKey);

  if (updErr) {
    console.error('Failed to update order during verify:', updErr);
    return jsonResponse(res, 500, { ok: false, message: 'Failed to update order' });
  }

  const creditsToAdd = order.credits ?? creditsFromMeta ?? (meta?.credits ? Number(meta.credits) : null);

  if (!order.client_id || !creditsToAdd) {
    return jsonResponse(res, 200, { ok: true, verified: true, note: 'order-updated-no-credit', order });
  }

  try {
    const { data: rpcData, error: rpcErr } = await supabaseAdmin.rpc('increment_customer_credits', {
      p_client_id: String(order.client_id),
      p_credits: Number(creditsToAdd)
    });
    if (rpcErr) {
      console.warn('RPC increment_customer_credits failed:', rpcErr);
      const { data: cust, error: getCustErr } = await supabaseAdmin
        .from('customers').select('credits').eq('client_id', order.client_id).limit(1).maybeSingle();
      if (getCustErr || !cust) {
        console.error('Failed to find customer for fallback credit update', getCustErr);
        return jsonResponse(res, 200, { ok: true, verified: true, note: 'order-updated-credit-failed', order });
      }
      const newCredits = (cust.credits || 0) + Number(creditsToAdd);
      const { error: updCustErr } = await supabaseAdmin
        .from('customers').update({ credits: newCredits }).eq('client_id', order.client_id);
      if (updCustErr) {
        console.error('Fallback credit update failed', updCustErr);
        return jsonResponse(res, 200, { ok: true, verified: true, note: 'order-updated-credit-failed', order });
      }
    }
  } catch (err) {
    console.error('Credit RPC thrown error', err);
    return jsonResponse(res, 200, { ok: true, verified: true, note: 'order-updated-credit-exception', order });
  }

  const { data: freshOrder } = await supabaseAdmin.from('orders').select('*').eq(orderKeyColumn, orderKey).limit(1).maybeSingle();
  return jsonResponse(res, 200, { ok: true, verified: true, order: freshOrder, paystack: paystackResp });
}
