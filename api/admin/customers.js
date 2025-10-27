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
    // query params: q (search), limit, offset, sort (col.asc|desc)
    const q = (req.query.q || req.query.search || '').toString().trim();
    const limit = Math.min(100, parseInt(req.query.limit || '25', 10) || 25);
    const offset = parseInt(req.query.offset || '0', 10) || 0;
    const sort = (req.query.sort || 'created_at.desc').toString();

    let builder = supabase.from('customers').select('client_id, phone, mpesa_phone, credits, created_at, updated_at, blocked, blocked_at, blocked_by', { count: 'exact' });

    if (q) {
      // search by client_id or phone
      builder = builder.or(`client_id.ilike.%${q}%,phone.ilike.%${q}%`);
    }

    // order
    const [col, dir] = sort.split('.');
    builder = builder.order(col || 'created_at', { ascending: (dir !== 'desc') });

    // range
    const from = offset;
    const to = offset + limit - 1;
    const { data, count, error } = await builder.range(from, to);
    if (error) throw error;

    return res.json({ data: data || [], total: count || 0, limit, offset });
  } catch (err) {
    console.error('admin/customers err', String(err));
    return res.status(500).json({ error: String(err) });
  }
}
