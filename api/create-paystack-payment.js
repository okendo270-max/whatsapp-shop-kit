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
      return res.status(405).json({ ok: false, step: 'method', message: 'Method not allowed' });
    }

    const body = req.body || {};
    const { clientId, packId, email: bodyEmail, phone: bodyPhone, paymentMethod = 'card' } = body;

    if (!clientId || !packId) {
      return res.status(400).json({ ok: false, step: 'input', message: 'clientId and packId required' });
    }

    // fetch pack
    try {
      const { data, error } = await supabase
        .from('credit_packs')
        .select('id, price, currency, credits, provider')
        .eq('id', packId)
        .maybeSingle();
      if (error) {
        // return full error JSON for debugging
        return res.status(500).json({ ok: false, step: 'fetch_pack', error: error });
      }
      if (!data) return res.status(404).json({ ok: false, step: 'pack_not_found', packId });
      var pack = data;
    } catch (e) {
      return res.status(500).json({ ok: false, step: 'fetch_pack_exception', error: String(e) });
    }

    // fetch customer
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('client_id, email, phone')
        .eq('client_id', clientId)
        .maybeSingle();
      if (error) {
        // return full error JSON for debugging
        return res.status(500).json({ ok: false, step: 'fetch_customer', error: error });
      }
      var customer = data || null;
    } catch (e) {
      return res.status(500).json({ ok: false, step: 'fetch_customer_exception', error: String(e) });
    }

    // return the fetched objects so we can inspect them immediately
    return res.status(200).json({ ok: true, step: 'debug_result', pack, customer });
  } catch (err) {
    return res.status(500).json({ ok: false, step: 'top_level', error: String(err) });
  }
}
