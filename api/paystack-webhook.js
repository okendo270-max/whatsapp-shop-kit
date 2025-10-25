// api/paystack-webhook.js
// Vercel serverless handler (ES module). Requires PAYSTACK_SECRET_KEY in env.
// Expects a server-side Supabase admin client exported from ./_supabase.js as `supabaseAdmin`.
// If your helper exports default, change the import accordingly.

import crypto from 'crypto';
import { supabaseAdmin } from './_supabase.js'; // <-- adjust if your helper exports differently

// Read raw request body (needed for signature verification)
async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', err => reject(err));
  });
}

// Timing-safe compare helper (accepts hex strings)
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

  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) {
    console.error('PAYSTACK_SECRET_KEY not set');
    res.status(500).json({ ok: false, message: 'Server misconfigured' });
    return;
  }

  // read raw bytes
  let raw;
  try {
    raw = await getRawBody(req);
  } catch (err) {
    console.error('Failed to read raw body', err);
    res.status(400).json({ ok: false });
    return;
  }

  // verify signature
  const headerSig = req.headers['x-paystack-signature'] || req.headers['X-Paystack-Signature'];
  const computedSig = crypto.createHmac('sha512', secret).update(raw).digest('hex');

  if (!headerSig || !safeCompareHex(computedSig, headerSig)) {
    console.warn('Paystack signature mismatch');
    res.status(401).json({ ok: false });
    return;
  }

  // parse JSON payload
  let event;
  try {
    event = JSON.parse(raw.toString('utf8'));
  } catch (err) {
    console.error('Invalid JSON payload from Paystack', err);
    res.status(400).json({ ok: false });
    return;
  }

  const eventId = event?.id ?? `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  const eventType = event?.event ?? null;
  const data = event?.data ?? event;

  // idempotency check
  try {
    // attempt to insert the event id to payment_events; if it conflicts, we've already processed
    const { error: insErr } = await supabaseAdmin
      .from('payment_events')
      .insert([{
        event_id: eventId,
        reference: data?.reference ?? data?.metadata?.reference ?? null,
        event_type: eventType,
        raw_payload: data
      }], { returning: 'minimal' });

    if (insErr) {
      // If insertion fails because of primary key conflict, treat as duplicate and return 200
      if (insErr.code === '23505' || (insErr.details && insErr.details.includes('already exists'))) {
        console.log('Duplicate webhook event, skipping:', eventId);
        res.status(200).json({ ok: true });
        return;
      }
      // Else, log and continue — we still may want to process, but prefer safe behaviour
      console.warn('payment_events insert error (non-duplicate):', insErr);
    }
  } catch (err) {
    console.error('Failed to write to payment_events for idempotency, proceeding cautiously', err);
    // continue — we'll still try to process; if the DB is down, fail later so Paystack retries
  }

  // Only process success charges here. Extend later for refunds/failed charges if needed.
  try {
    const isChargeSuccess = (eventType === 'charge.success') || (data?.status === 'success' && data?.reference);

    if (!isChargeSuccess) {
      // store minimal info already done; return 200
      res.status(200).json({ ok: true });
      return;
    }

    // Resolve reference and client metadata
    const reference = data.reference ?? data?.metadata?.reference ?? data?.id ?? null;
    const meta = data?.metadata ?? {};
    const clientId = meta.clientId ?? meta.client_id ?? null;
    const packCredits = meta.credits ?? meta.credits_amount ?? null;

    // Attempt to find the order in several ways
    let order = null;

    // 1) Match orders.paystack_reference if populated
    if (reference) {
      const { data: o1, error: o1err } = await supabaseAdmin
        .from('orders')
        .select('*')
        .eq('paystack_reference', reference)
        .limit(1)
        .maybeSingle();
      if (!o1err && o1) order = o1;
    }

    // 2) Match orders.order.order_id === reference (in case you stored reference there)
    if (!order && reference) {
      const { data: o2, error: o2err } = await supabaseAdmin
        .from('orders')
        .select('*')
        .eq('order.order_id', reference)
        .limit(1)
        .maybeSingle();
      if (!o2err && o2) order = o2;
    }

    // 3) Match orders.payload->>'reference' equals reference
    if (!order && reference) {
      const { data: o3, error: o3err } = await supabaseAdmin
        .from('orders')
        .select('*')
        .filter("payload->>reference", "eq", reference)
        .limit(1)
        .maybeSingle();
      if (!o3err && o3) order = o3;
    }

    // 4) If still not found and clientId exists, find most recent pending order for that client
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

    if (!order) {
      console.warn('Order not found for webhook reference/client meta. Reference:', reference, 'clientId:', clientId);
      // we already recorded the event in payment_events so return 200 to avoid repeated retries
      res.status(200).json({ ok: true, note: 'order-not-found' });
      return;
    }

    // If order already processed, skip crediting again
    const alreadyProcessed = order.webhook_processed === true || order.status === 'completed';
    if (alreadyProcessed) {
      console.log('Order already marked processed; skipping credit update. order:', order.order_id ?? order.order.order_id);
      res.status(200).json({ ok: true, note: 'order-already-processed' });
      return;
    }

    // Update order atomically: set status, paystack_reference (if empty), payload, webhook_processed and processed_at
    const updates = {
      status: 'completed',
      webhook_processed: true,
      processed_at: new Date().toISOString(),
      payload: data
    };
    if (!order.paystack_reference && reference) updates.paystack_reference = reference;

    const { error: updErr } = await supabaseAdmin
      .from('orders')
      .update(updates)
      .eq('order.order_id', order.order.order_id);

    if (updErr) {
      console.error('Failed to update order row:', updErr);
      // return 500 so Paystack retries
      res.status(500).json({ ok: false });
      return;
    }

    // Credit the customer — prefer the atomic RPC if present
    const creditsToAdd = order.credits ?? packCredits ?? (data?.metadata?.credits ? Number(data.metadata.credits) : null);

    if (!order.client_id) {
      console.warn('Order has no client_id; cannot credit customer. Order id:', order.order_id);
      res.status(200).json({ ok: true, note: 'no-client-id' });
      return;
    }

    if (!creditsToAdd) {
      console.warn('No credits amount found on order or metadata; skipping credit update. order:', order.order_id);
      res.status(200).json({ ok: true, note: 'no-credits' });
      return;
    }

    // Try RPC increment_customer_credits(p_client_id, p_credits)
    let creditSuccess = false;
    try {
      const { data: rpcData, error: rpcErr } = await supabaseAdmin.rpc('increment_customer_credits', {
        p_client_id: String(order.client_id),
        p_credits: Number(creditsToAdd)
      });
      if (rpcErr) {
        console.log('RPC increment_customer_credits failed or not present:', rpcErr);
      } else {
        console.log('Credits incremented via RPC for client', order.client_id);
        creditSuccess = true;
      }
    } catch (rpcEx) {
      console.warn('RPC call threw:', rpcEx);
    }

    // Fallback: best-effort read-and-update (not strictly atomic)
    if (!creditSuccess) {
      try {
        const { data: cust, error: getCustErr } = await supabaseAdmin
          .from('customers')
          .select('credits')
          .eq('client_id', order.client_id)
          .limit(1)
          .maybeSingle();

        if (getCustErr || !cust) {
          console.error('Failed to find customer for fallback credit update:', getCustErr);
        } else {
          const newCredits = (cust.credits || 0) + Number(creditsToAdd);
          const { error: updCustErr } = await supabaseAdmin
            .from('customers')
            .update({ credits: newCredits })
            .eq('client_id', order.client_id);
          if (updCustErr) {
            console.error('Failed to update customer credits (fallback):', updCustErr);
          } else {
            console.log('Customer credits updated (fallback) for', order.client_id);
            creditSuccess = true;
          }
        }
      } catch (fbErr) {
        console.error('Fallback credit update error:', fbErr);
      }
    }

    // Success path: respond 200
    if (creditSuccess) {
      res.status(200).json({ ok: true });
      return;
    } else {
      // We updated the order status but could not credit; still return 200 to avoid retries,
      // but create an admin-visible log or alert in DB if you want.
      console.warn('Order processed but credits not applied. Order id:', order.order_id);
      res.status(200).json({ ok: true, note: 'processed-no-credit' });
      return;
    }
  } catch (err) {
    console.error('Unhandled webhook error:', err);
    // Return 500 so Paystack retries
    res.status(500).json({ ok: false });
  }
}
