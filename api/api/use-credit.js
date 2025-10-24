// api/use-credit.js
const { supabaseAdmin } = require('./_supabase');

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const body = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
    const clientId = (body.clientId || req.query.clientId || req.headers['x-client-id'] || '').trim();
    const amount = Number(body.amount || 1);

    if (!clientId) return res.status(400).json({ error: 'clientId required' });
    if (!Number.isInteger(amount) || amount <= 0) return res.status(400).json({ error: 'amount must be positive integer' });

    // Call Postgres function use_credits(p_client_id, p_amount)
    const { data, error } = await supabaseAdmin.rpc('use_credits', { p_client_id: clientId, p_amount: amount });

    if (error) {
      console.error('rpc use_credits error', error);
      return res.status(500).json({ error: 'db error' });
    }

    // data will be an integer (remaining credits) or null
    const remaining = data; // might be null
    if (remaining === null) {
      return res.status(402).json({ error: 'insufficient_credits' });
    }

    return res.json({ clientId, remainingCredits: Number(remaining) });
  } catch (err) {
    console.error('use-credit handler', err);
    return res.status(500).json({ error: String(err) });
  }
};
