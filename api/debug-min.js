export default function handler(req, res) {
  try {
    const env = {
      SUPABASE_URL: !!process.env.SUPABASE_URL,
      SUPABASE_SERVICE_KEY: !!process.env.SUPABASE_SERVICE_KEY,
      PAYSTACK_SECRET_KEY: !!process.env.PAYSTACK_SECRET_KEY,
      BASE_URL: !!process.env.BASE_URL,
      NODE_VERSION: process.version || null,
      VERCEL_ENV: process.env.VERCEL_ENV || null
    };
    return res.status(200).json({ ok: true, env });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err) });
  }
}
