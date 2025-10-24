// api/debug-supabase.js
// Safe debug endpoint: returns whether supabase client is usable and a small sample query.
// Put this in api/ and deploy (or call via vercel dev/ngrok).

async function tryImport() {
  try {
    // Attempt a flexible import so we cover different export styles
    const mod = await import('./_supabase.js');
    // support: named export supabaseAdmin, default export, or a property
    const supabaseAdmin = mod.supabaseAdmin ?? mod.default ?? mod.supabase ?? null;
    return { ok: true, supabaseAdmin };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, message: 'GET only' });

  const { ok, supabaseAdmin, error } = await tryImport();
  if (!ok) return res.status(500).json({ ok: false, importError: error });

  if (!supabaseAdmin) {
    return res.status(500).json({ ok: false, message: 'imported module found but no supabase client (supabaseAdmin) exported' });
  }

  try {
    // Try a harmless query to payment_events (safe even if table empty)
    const { data, error: qErr } = await supabaseAdmin.from('payment_events').select('event_id').limit(1);
    if (qErr) {
      return res.status(500).json({ ok: false, queryError: qErr });
    }
    return res.status(200).json({ ok: true, sample: data ?? [] });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err) });
  }
}
