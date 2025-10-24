// api/credits.js
const { supabaseAdmin } = require('./_supabase');

module.exports = async (req, res) => {
  try {
    const clientId = (req.query.clientId || req.headers['x-client-id'] || '').trim();
    if (!clientId) return res.status(400).json({ error: 'clientId required' });

    // ensure customer exists
    const upsert = await supabaseAdmin
      .from('customers')
      .upsert({ client_id: clientId }, { onConflict: 'client_id' });

    if (upsert.error) {
      console.error('upsert customer error', upsert.error);
      return res.status(500).json({ error: 'db error' });
    }

    const { data, error } = await supabaseAdmin
      .from('customers')
      .select('credits')
      .eq('client_id', clientId)
      .limit(1)
      .single();

    if (error) {
      console.error('select credits error', error);
      return res.status(500).json({ error: 'db error' });
    }

    return res.json({ clientId, credits: Number(data.credits || 0) });
  } catch (err) {
    console.error('credits handler', err);
    return res.status(500).json({ error: String(err) });
  }
};
