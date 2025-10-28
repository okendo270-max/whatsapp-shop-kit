const BASE_URL = '/api/admin';
const ADMIN_SECRET = import.meta.env.VITE_ADMIN_SECRET || '';

async function fetchJson(url, opts = {}) {
  const res = await fetch(url, opts);
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Request failed ${res.status}: ${txt}`);
  }
  return res.json();
}

export function fetchCustomers(page = 1, perPage = 25) {
  return fetchJson(`${BASE_URL}/customers?page=${page}&per_page=${perPage}`, {
    headers: { 'x-admin-secret': ADMIN_SECRET },
  });
}

export function blockUser(clientId, block, reason, changedBy) {
  return fetchJson(`${BASE_URL}/block-user`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-secret': ADMIN_SECRET,
    },
    body: JSON.stringify({ clientId, block, reason, changedBy }),
  });
}

export function adjustCredits(clientId, amount, changedBy) {
  return fetchJson(`${BASE_URL}/adjust-credits`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-secret': ADMIN_SECRET,
    },
    body: JSON.stringify({ clientId, amount, changedBy }),
  });
}
