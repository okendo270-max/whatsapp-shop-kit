import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

function checkSecret(req) {
  const s = process.env.ADMIN_SECRET || '';
  if (!s) return true; // dev convenience
  const h = req.headers['x-admin-secret'] || req.headers['X-Admin-Secret'];
  return h === s;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!checkSecret(req)) return res.status(403).json({ error: 'forbidden' });

  try {
    const { count: total_customers } = await supabase.from('customers').select('client_id', { head: true, count: 'exact' });
    const { count: total_purchases } = await supabase.from('credit_purchases').select('purchase_id', { head: true, count: 'exact' });
    const { count: total_spends } = await supabase.from('credit_spends').select('spend_id', { head: true, count: 'exact' });
    const { count: total_orders } = await supabase.from('orders').select('order_id', { head: true, count: 'exact' });

    const { data: customers } = await supabase.from('customers').select('credits');
    const total_credits = Array.isArray(customers) ? customers.reduce((s, r) => s + (Number(r.credits) || 0), 0) : 0;

    return res.json({
      total_customers: total_customers || 0,
      total_purchases: total_purchases || 0,
      total_spends: total_spends || 0,
      total_orders: total_orders || 0,
      total_credits
    });
  } catch (err) {
    console.error('admin/summary err', String(err));
    return res.status(500).json({ error: String(err) });
  }
}
