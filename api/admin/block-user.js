import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

function checkSecret(req) {
  const s = process.env.ADMIN_SECRET || '';
  if (!s) return true; // dev convenience
  const h = req.headers['x-admin-secret'] || req.headers['X-Admin-Secret'];
  return h === s;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!checkSecret(req)) return res.status(403).json({ error: 'forbidden' });

  const { clientId, block, reason, changedBy } = req.body || {};
  if (!clientId || typeof block !== 'boolean' || !changedBy) {
    return res.status(400).json({ error: 'clientId, block (boolean) and changedBy required' });
  }

  try {
    const now = new Date().toISOString();
    const update = {
      blocked: block,
      blocked_at: block ? now : null,
      blocked_by: block ? changedBy : null,
      updated_at: now
    };

    const { error: updErr } = await supabase.from('customers').update(update).eq('client_id', clientId);
    if (updErr) throw updErr;

    // audit record
    const payload = { clientId, block, reason, changedBy, timestamp: now };
    const { error: insErr } = await supabase.from('admin_actions').insert([{
      action_type: block ? 'block_user' : 'unblock_user',
      client_id: clientId,
      payload,
      performed_by: changedBy
    }]);
    if (insErr) console.warn('admin/block-user: audit insert failed', String(insErr));

    return res.json({ ok: true, clientId, blocked: block });
  } catch (err) {
    console.error('admin/block-user error', String(err));
    return res.status(500).json({ error: String(err) });
  }
}
