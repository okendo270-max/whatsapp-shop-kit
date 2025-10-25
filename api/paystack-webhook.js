// api/paystack-webhook.js (patched - defensive checks)
// Drop this file into api/ and deploy. Expects a server-side Supabase admin client exported as supabaseAdmin from ./_supabase.js

import crypto from 'crypto';
import { supabaseAdmin } from './_supabase.js'; // adjust if your helper exports differently

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', err => reject(err));
  });
}

function safeCompareHex(aHex, bHex) {
  try {
    const a = Buffer.from(aHex, 'hex');
    const b = Buffer.from(bHex, 'hex');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch (e) {
    return false;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, message: 'Method Not Allowed' });
    return;
  }

  const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;
  if (!PAYSTACK_SECRET) {
    console.error('Missing PAYSTACK_SECRET_KEY');
    res.status(500).json({ ok: false, message: 'Server misconfigured' });
    return;
  }

  let raw;
  try {
    raw = await getRawBody(req);
  } catch (err) {
    console.error('Failed to read raw body:', err);
    res.status(400).json({ ok: false });
    return;
  }

  const headerSig = req.headers['x-paystack-signature'] || req.headers['X-Paystack-Signature'];
  const computed = crypto.createHmac('sha512', PAYSTACK_SECRET).update(raw).digest('hex');

  if (!headerSig || !safeCompareHex(computed, headerSig)) {
    console.warn('Paystack signature mismatch');
    res.status(401).json({ ok: false });
    return;
  }

  let event;
  try {
    event = JSON.parse(raw.toString('utf8'));
  } catch (err) {
    console.error('Failed to parse JSON payload', err);
    res.status(400).json({ ok: false });
    return;
  }

  const eventId = event?.id ?? null;
  const eventType = event?.event ?? null;
  const payload = event?.data ?? event;

  // Attempt idempotent insert of event into payment_events
  try {
    if (eventId) {
      const { error: insErr } = await supabaseAdmin
        .from('payment_events')
        .insert([{
          event_id: eventId,
          reference: payload?.reference ?? payload?.metadata?.reference ?? null,
          event_type: eventType,
          raw_payload: payload
        }], { returning: 'minimal' });

      if (insErr) {
        // primary key conflict -> duplicate event -> safe to return 200
        if (insErr.code === '23505' || (insErr.details && insErr.details.includes('already exists'))) {
          console.log('Duplicate webhook event, skipping:', eventId);
          res.status(200).json({ ok: true });
          return;
        }
        console.warn('payment_events insert error (non-duplicate):', insErr);
      }
    }
  } catch (err) {
    console.error('Failed writing to payment_events table; proceeding cautiously', err);
    // continue — we'll still try to process but prefer to fail later if necessary
  }

  try {
    const isChargeSuccess = (eventType === 'charge.success') || (payload?.status === 'success' && payload?.reference);
    if (!isChargeSuccess) {
      // already recorded minimal info; return 200
      res.status(200).json({ ok: true });
      return;
    }

    const reference = payload.reference ?? payload?.metadata?.reference ?? payload?.id ?? null;
    const meta = payload?.metadata ?? {};
    const clientId = meta.clientId ?? meta.client_id ?? null;
    const packCredits = meta.credits ?? meta.credits_amount ?? null;

    // find order defensively
    let order = null;

    if (reference) {
      const { data: o1, error: o1err } = await supabaseAdmin
        .from('orders')
        .select('*')
        .eq('paystack_reference', reference)
        .limit(1)
        .maybeSingle();
      if (!o1err && o1) order = o1;
    }

    if (!order && reference) {
      const { data: o2, error: o2err } = await supabaseAdmin
        .from('orders')
        .select('*')
        .eq('order_id', reference)
        .limit(1)
        .maybeSingle();
      if (!o2err && o2) order = o2;
    }

    if (!order && reference) {
      const { data: o3, error: o3err } = await supabaseAdmin
        .from('orders')
        .select('*')
        .filter("payload->>reference", "eq", reference)
        .limit(1)
        .maybeSingle();
      if (!o3err && o3) order = o3;
    }

    if (!order && clientId) {
      const { data: o4, error: o4err } = await supabaseAdmin
        .from('orders')
        .select('*')
        .eq('client_id', clientId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!o4err && o4) order = o4;
    }

    // Defensive guard: if no order, record note and return 200
    if (!order) {
      console.warn('Order not found for webhook. reference:', reference, 'clientId:', clientId);
      res.status(200).json({ ok: true, note: 'order-not-found' });
      return;
    }

    // now safe to read order properties
    const alreadyProcessed = (order.webhook_processed === true) || (order.status === 'completed');
    if (alreadyProcessed) {
      console.log('Order already processed; skipping. order_id:', order.order_id ?? order.id);
      res.status(200).json({ ok: true });
      return;
    }

    // prepare updates
    const updates = {
      status: 'completed',
      webhook_processed: true,
      processed_at: new Date().toISOString(),
      payload: payload
    };
    if (!order.paystack_reference && reference) updates.paystack_reference = reference;

    // perform update using order_id (works whether your PK is order_id)
    const orderKey = order.order_id ?? order.id;
    const orderKeyColumn = order.order_id ? 'order_id' : 'id';

    const { error: updErr } = await supabaseAdmin
      .from('orders')
      .update(updates)
      .eq(orderKeyColumn, orderKey);

    if (updErr) {
      console.error('Failed to update order:', updErr);
      res.status(500).json({ ok: false });
      return;
    }

    // credit customer atomically via RPC if available
    const creditsToAdd = order.credits ?? packCredits ?? (payload?.metadata?.credits ? Number(payload.metadata.credits) : null);

    if (!order.client_id) {
      console.warn('Order has no client_id; cannot credit. order:', orderKey);
      res.status(200).json({ ok: true, note: 'no-client-id' });
      return;
    }

    let creditSuccess = false;
    try {
      const { data: rpcData, error: rpcErr } = await supabaseAdmin.rpc('increment_customer_credits', {
        p_client_id: String(order.client_id),
        p_credits: Number(creditsToAdd)
      });
      if (!rpcErr) {
        creditSuccess = true;
        console.log('Credits incremented via RPC for client', order.client_id);
      } else {
        console.log('RPC increment_customer_credits not available or failed:', rpcErr);
      }
    } catch (rpcEx) {
      console.warn('RPC call threw:', rpcEx);
    }

    if (!creditSuccess) {
      // fallback: best-effort read & update
      try {
        const { data: cust, error: getCustErr } = await supabaseAdmin
          .from('customers')
          .select('credits')
          .eq('client_id', order.client_id)
          .limit(1)
          .maybeSingle();

        if (getCustErr || !cust) {
          console.error('Failed to locate customer for fallback credit update:', getCustErr || 'no customer');
        } else {
          const newCredits = (cust.credits || 0) + Number(creditsToAdd);
          const { error: updCustErr } = await supabaseAdmin
            .from('customers')
            .update({ credits: newCredits })
            .eq('client_id', order.client_id);
          if (!updCustErr) {
            creditSuccess = true;
            console.log('Customer credits updated (fallback) for', order.client_id);
          } else {
            console.error('Failed to update customer credits (fallback):', updCustErr);
          }
        }
      } catch (fbErr) {
        console.error('Fallback credit update error:', fbErr);
      }
    }

    // record success path (already logged into payment_events earlier)
    if (creditSuccess) {
      res.status(200).json({ ok: true });
      return;
    } else {
      console.warn('Order processed but credits not applied. order:', orderKey);
      res.status(200).json({ ok: true, note: 'processed-no-credit' });
      return;
    }
  } catch (err) {
    console.error('Unhandled webhook error:', err);
    res.status(500).json({ ok: false });
  }
}
