const BASE_URL = '/api/admin';

export async function fetchCustomers(page = 1, perPage = 25) {
  const res = await fetch(`${BASE_URL}/customers?page=${page}&per_page=${perPage}`, {
    headers: {
      'x-admin-secret': process.env.ADMIN_SECRET || '', // ensure env var available
    },
  });
  if (!res.ok) throw new Error('Failed to fetch customers');
  return res.json();
}

export async function blockUser(clientId, block, reason, changedBy) {
  const res = await fetch(`${BASE_URL}/block-user`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-secret': process.env.ADMIN_SECRET || '',
    },
    body: JSON.stringify({ clientId, block, reason, changedBy }),
  });
  if (!res.ok) throw new Error('Failed to block/unblock user');
  return res.json();
}

export async function adjustCredits(clientId, amount, changedBy) {
  const res = await fetch(`${BASE_URL}/adjust-credits`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-secret': process.env.ADMIN_SECRET || '',
    },
    body: JSON.stringify({ clientId, amount, changedBy }),
  });
  if (!res.ok) throw new Error('Failed to adjust credits');
  return res.json();
}
