import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  try {
    const env = {
      SUPABASE_URL: !!process.env.SUPABASE_URL,
      SUPABASE_SERVICE_KEY: !!process.env.SUPABASE_SERVICE_KEY,
      PAYSTACK_SECRET_KEY: !!process.env.PAYSTACK_SECRET_KEY,
      BASE_URL: !!process.env.BASE_URL
    };

    let supabaseOk = false;
    let supabaseError = null;

    if (env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY) {
      try {
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
        const { error } = await supabase.from('customers').select('client_id').limit(1);
        if (!error) supabaseOk = true;
        else supabaseError = String(error.message || error);
      } catch (e) {
        supabaseError = String(e);
      }
    }

    return res.status(200).json({ ok: true, env, supabaseOk, supabaseError });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err) });
  }
}
