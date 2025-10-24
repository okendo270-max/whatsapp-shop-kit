// api/health.js
const { supabaseAdmin } = require('./_supabase');

module.exports = async function handler(req, res) {
  try {
    // Lightweight check: read one customer row (safe even if table empty)
    const { data, error } = await supabaseAdmin
      .from('customers')
      .select('client_id')
      .limit(1);

    if (error && !data) {
      // Table missing or other DB error
      return res.status(500).json({ ok: false, error: error.message || String(error) });
    }

    return res.json({ ok: true, sample: data && data.length ? data[0] : null });
  } catch (err) {
    console.error('health error', err);
    return res.status(500).json({ ok: false, error: String(err) });
  }
};
