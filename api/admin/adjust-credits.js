import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

function checkSecret(req) {
  const s = process.env.ADMIN_SECRET || '';
  const h = req.headers['x-admin-secret'] || req.headers['X-Admin-Secret'];
  return s && h === s;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!checkSecret(req)) return res.status(403).json({ error: 'forbidden' });

  const { clientId, delta, reason, changedBy } = req.body || {};
  if (!clientId || typeof delta !== 'number' || !changedBy) {
    return res.status(400).json({ error: 'clientId, delta (number), and changedBy required' });
  }

  try {
    // get current credits
    const { data: customer, error: fetchError } = await supabase
      .from('customers')
      .select('credits')
      .eq('client_id', clientId)
      .single();

    if (fetchError) throw fetchError;
    const before = customer?.credits || 0;
    const after = before + delta;

    // update credits
    const { error: updateError } = await supabase
      .from('customers')
      .update({ credits: after, updated_at: new Date().toISOString() })
      .eq('client_id', clientId);

    if (updateError) throw updateError;

    // log adjustment
    const { error: insertError } = await supabase.from('credit_adjustments').insert({
      client_id: clientId,
      changed_by: changedBy,
      reason,
      credits_before: before,
      credits_after: after,
      delta,
    });

    if (insertError) throw insertError;

    return res.json({ ok: true, clientId, before, after, delta });
  } catch (err) {
    console.error('adjust-credits error', err);
    return res.status(500).json({ error: String(err) });
  }
}
