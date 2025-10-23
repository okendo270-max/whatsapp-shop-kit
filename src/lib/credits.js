// src/lib/credits.js
// client helpers (talk to serverless endpoints on same domain)
export function getClientId() {
  let id = localStorage.getItem('wski_client_id');
  if (!id) {
    id = 'c_' + Math.random().toString(36).slice(2,12);
    localStorage.setItem('wski_client_id', id);
  }
  return id;
}

export function getCustomerId() {
  return localStorage.getItem('wski_customer_id') || null;
}

export function setCustomerId(id) {
  localStorage.setItem('wski_customer_id', id);
}

export async function createCheckoutSession({ clientId, customerId }) {
  const resp = await fetch('/api/create-checkout-session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ clientId, customerId })
  });
  return resp.json();
}

export async function fetchCredits(customerId) {
  if (!customerId) return 0;
  const qs = new URLSearchParams({ customerId });
  const resp = await fetch('/api/credits?' + qs.toString());
  if (!resp.ok) return 0;
  const j = await resp.json();
  return j.credits || 0;
}

export async function useCredits(customerId, amount = 1) {
  const resp = await fetch('/api/use-credit', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ customerId, amount })
  });
  const j = await resp.json();
  if (!resp.ok) throw j;
  return j;
}
