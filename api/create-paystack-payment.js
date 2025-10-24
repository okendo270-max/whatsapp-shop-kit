// api/create-paystack-payment.js
// Create a Paystack transaction (initialize) and record a pending order in Supabase.
// CommonJS style to match your other api/* files.

const { supabaseAdmin } = require("./_supabase");
const crypto = require("crypto");

const PAYSTACK_KEY = process.env.PAYSTACK_SECRET_KEY;
const BASE_URL = process.env.BASE_URL || "";

function makeOrderId() {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "ord_" + crypto.randomBytes(8).toString("hex");
}

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "POST")
      return res.status(405).json({ error: "Method not allowed" });

    if (!PAYSTACK_KEY)
      return res
        .status(500)
        .json({ error: "Missing PAYSTACK_SECRET_KEY env var" });

    const body =
      typeof req.body === "object" ? req.body : JSON.parse(req.body || "{}");
    const clientId = (body.clientId || "").trim();
    const packId = body.packId || null;
    // optional email - Paystack requires an email; if missing we fallback to a synthetic one
    const email = (body.email || "").trim();

    if (!clientId) return res.status(400).json({ error: "clientId required" });
    if (!packId) return res.status(400).json({ error: "packId required" });

    // fetch pack info from DB
    const { data: packs, error: packErr } = await supabaseAdmin
      .from("credit_packs")
      .select("*")
      .eq("id", packId)
      .limit(1)
      .single();

    if (packErr || !packs) {
      console.error("pack lookup error", packErr);
      return res.status(400).json({ error: "invalid packId" });
    }

    const pack = packs;
    // Paystack expects amount in kobo (smallest currency unit)
    // We assume price stored in major units (e.g. 300.00 KES) — multiply by 100
    const amountKobo = Math.round(Number(pack.price) * 100);

    // generate an order reference (idempotent from client perspective if you reuse)
    const orderId = makeOrderId();

    // create a pending order row
    const { error: insertErr } = await supabaseAdmin.from("orders").insert({
      order_id: orderId,
      client_id: clientId,
      provider: "paystack",
      amount: pack.price,
      credits: pack.credits,
      status: "pending",
      payload: { createdAt: new Date().toISOString(), packId },
    });

    if (insertErr) {
      console.error("orders insert error", insertErr);
      return res.status(500).json({ error: "db_error" });
    }

    // Build initialize payload. Paystack requires an email; if not provided use fallback.
    const customerEmail = email || `${clientId}@local.invalid`;

    const initBody = {
      amount: amountKobo,
      email: customerEmail,
      reference: orderId,
      callback_url: `${BASE_URL.replace(/\/$/, "")}/api/paystack-callback`,
      metadata: { clientId, packId },
    };

    // call Paystack initialize endpoint
    const r = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PAYSTACK_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(initBody),
    });

    const j = await r.json();

    if (!r.ok) {
      console.error("paystack init failed", j);
      // update order to failed with payload for debugging
      await supabaseAdmin
        .from("orders")
        .update({ status: "failed", payload: j })
        .eq("order_id", orderId);
      return res
        .status(400)
        .json({ error: j.message || "paystack_init_failed", details: j });
    }

    // success: Paystack returns data.authorization_url and data.reference
    const auth = j.data || {};
    // store response payload for audit
    await supabaseAdmin
      .from("orders")
      .update({ payload: auth })
      .eq("order_id", orderId);

    return res.json({
      success: true,
      orderId,
      reference: auth.reference || orderId,
      authorization_url: auth.authorization_url || auth.gateway_url || null,
      raw: auth,
    });
  } catch (err) {
    console.error("create-paystack-payment error", err);
    return res.status(500).json({ error: String(err) });
  }
};
