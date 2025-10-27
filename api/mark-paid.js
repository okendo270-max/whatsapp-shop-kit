import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { orderId, paidAt, method, reference, proofUrl, markedBy } = req.body || {};

  if (!orderId) return res.status(400).json({ error: 'orderId required' });

  try {
    const payload = {
      paid_at: paidAt ? new Date(paidAt).toISOString() : new Date().toISOString(),
      payment_method: method || 'manual',
      payment_reference: reference || null,
      payment_proof_url: proofUrl || null,
      marked_paid_by: markedBy || null,
      status: 'paid',
      processed_at: new Date().toISOString()
    };

    const { error } = await supabase.from('orders').update(payload).eq('order_id', orderId);
    if (error) return res.status(500).json({ error: String(error) });

    return res.json({ ok: true, orderId, paid_at: payload.paid_at });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}
