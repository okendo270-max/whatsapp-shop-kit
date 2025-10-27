import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

function checkSecret(req) {
  const s = process.env.ADMIN_SECRET || '';
  if (!s) return true;
  const h = req.headers['x-admin-secret'] || req.headers['X-Admin-Secret'];
  return h === s;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!checkSecret(req)) return res.status(403).json({ error: 'forbidden' });

  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 25)));
    const { data, error } = await supabase
      .from('credit_purchases')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return res.json(data || []);
  } catch (err) {
    console.error('admin/purchases err', String(err));
    return res.status(500).json({ error: String(err) });
  }
}
