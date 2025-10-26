/*
 scripts/send-paystack-test.js
 Usage:
   export PAYSTACK_SECRET_KEY="(your sandbox secret)"
   node scripts/send-paystack-test.js https://whatsapp-shop-kit.vercel.app/api/paystack-webhook
*/
const crypto = require('crypto');

if (process.argv.length < 3) {
  console.error('Usage: node scripts/send-paystack-test.js <webhook_url>');
  process.exit(1);
}

const targetUrl = process.argv[2];
const secret = process.env.PAYSTACK_SECRET_KEY;
if (!secret) {
  console.error('Set PAYSTACK_SECRET_KEY in env, e.g. export PAYSTACK_SECRET_KEY=\"sk_test_...\"');
  process.exit(1);
}

const event = {
  id: `evt_${Date.now()}`,
  event: 'charge.success',
  data: {
    reference: `test-ref-${Date.now()}`,
    status: 'success',
    metadata: {
      clientId: 'test-client-1',
      credits: 10
    }
  }
};

const payload = JSON.stringify(event);
const signature = crypto.createHmac('sha512', secret).update(payload).digest('hex');

(async () => {
  try {
    const res = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-paystack-signature': signature
      },
      body: payload
    });
    console.log('Sent test webhook to', targetUrl);
    console.log('Response status:', res.status);
    console.log('Response body:', await res.text());
  } catch (err) {
    console.error('Request failed:', err);
  }
})();
