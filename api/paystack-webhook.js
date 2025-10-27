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
    const packId = metadata.packId || metadata.pack_id || null; // if present, this is a credit purchase
    const reference = data.reference || data.tx_ref || null;
    const amount = data.amount || data.requested_amount || null;

    // --- Log the webhook to payment_events for auditing (best-effort) ---
    try {
      await supabase.from('payment_events').insert([{
        event_type: eventType || 'unknown',
        reference: reference || null,
        raw_payload: data,
        received_at: new Date().toISOString()
      }]);
    } catch (logErr) {
      console.warn('paystack-webhook: failed to log event to payment_events', String(logErr));
      // continue even if logging fails
    }

    // If this webhook corresponds to a credit pack purchase, handle it in the credit_purchases table
    if (packId) {
      // 1) insert into credit_purchases (best-effort). If duplicate insert fails, ignore and continue.
      const purchase = {
        client_id: clientId || 'unknown',
        pack_id: String(packId),
        amount: amount ? (Number(amount) / 100) : null, // store in main currency units
        currency: data.currency || 'KES',
        paystack_reference: reference || null,
        paystack_payload: data,
        status: (data.status || 'paid'),
        created_at: new Date().toISOString(),
        processed_at: new Date().toISOString()
      };

      try {
        const { error: insErr } = await supabase.from('credit_purchases').insert([purchase]);
        if (insErr) {
          // ignore duplicate/constraint errors but log them
          console.warn('paystack-webhook: credit_purchases insert error (ignored)', String(insErr));
        }
      } catch (e) {
        console.warn('paystack-webhook: credit_purchases insert threw', String(e));
      }

      // 2) determine credits in the pack
      let creditsToAdd = null;
      try {
        const { data: pack, error: packErr } = await supabase.from('credit_packs').select('credits').eq('id', packId).maybeSingle();
        if (!packErr && pack) creditsToAdd = pack.credits;
      } catch (e) {
        console.warn('paystack-webhook: failed to fetch credit_packs', String(e));
      }

      // 3) credit the customer's account (try RPC, fallback to read-modify-write)
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

      return res.status(200).json({ ok: true, message: 'credit processed', purchase: purchase, credited });
    }

    // Non-pack event: we intentionally do not touch invoices/orders.
    // Already logged to payment_events above; return an "ignored" response for non-credit events.
    return res.status(200).json({ ok: true, message: 'ignored non-credit event' });

  } catch (err) {
    console.error('paystack-webhook top-level error', err && err.stack ? err.stack : String(err));
    return res.status(500).json({ ok: false, error: String(err) });
  }
}
