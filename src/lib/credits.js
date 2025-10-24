// src/lib/credits.js
// Client helpers (talk to serverless endpoints on same domain)

const DEFAULT_TIMEOUT = 8000; // 8 seconds

// Helper: fetch with timeout
async function fetchWithTimeout(url, options = {}, timeout = DEFAULT_TIMEOUT) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return res;
  } catch (err) {
    clearTimeout(id);
    if (err.name === 'AbortError') throw new Error('request_timeout');
    throw err;
  }
}

// Generate or retrieve unique client ID
export function getClientId() {
  try {
    let id = localStorage.getItem('wski_client_id');
    if (!id) {
      id = 'c_' + Math.random().toString(36).slice(2, 12);
      localStorage.setItem('wski_client_id', id);
    }
    return id;
  } catch {
    return 'c_' + Math.random().toString(36).slice(2, 12);
  }
}

// Get/set customer ID (linked to Paystack or Supabase)
export function getCustomerId() {
  return localStorage.getItem('wski_customer_id') || null;
}

export function setCustomerId(id) {
  if (!id) return;
  localStorage.setItem('wski_customer_id', id);
}

// Create checkout session (Paystack or other provider)
export async function createCheckoutSession({ clientId, customerId }) {
  const payload = { clientId, customerId };
  const res = await fetchWithTimeout('/api/create-checkout-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  let json;
  try {
    json = await res.json();
  } catch {
    throw new Error('invalid_json_response');
  }

  if (!res.ok) throw new Error(json.error || 'Failed to create checkout session');
  return json;
}

// Fetch credits balance
export async function fetchCredits(customerId) {
  if (!customerId) return 0;

  const qs = new URLSearchParams({ customerId });
  const res = await fetchWithTimeout('/api/credits?' + qs.toString());

  if (!res.ok) return 0;

  let json;
  try {
    json = await res.json();
  } catch {
    return 0;
  }

  return json.credits ?? 0;
}

// Deduct credits
export async function useCredits(customerId, amount = 1) {
  if (!customerId) throw new Error('Missing customerId');
  if (!Number.isInteger(amount) || amount <= 0) throw new Error('Invalid amount');

  const res = await fetchWithTimeout('/api/use-credit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ customerId, amount }),
  });

  let json;
  try {
    json = await res.json();
  } catch {
    throw new Error('invalid_json_response');
  }

  if (!res.ok) {
    const msg = json?.error || 'useCredits_failed';
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }

  return json; // { success, remainingCredits }
}
