import React, { useEffect, useState } from 'react';

function Table({ title, rows, columns }) {
  return (
    <div style={{marginBottom:20}}>
      <h3>{title} ({rows.length})</h3>
      <div style={{overflowX:'auto'}}>
        <table style={{width:'100%', borderCollapse:'collapse'}}>
          <thead>
            <tr>
              {columns.map(c => <th key={c} style={{textAlign:'left', padding:8, borderBottom:'1px solid #ddd'}}>{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} style={{borderBottom:'1px solid #f1f1f1'}}>
                {columns.map(c => <td key={c} style={{padding:8, fontSize:13}}>{String(r[c] ?? '')}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const [summary, setSummary] = useState(null);
  const [purchases, setPurchases] = useState([]);
  const [spends, setSpends] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);

  const adminHeader = { 'x-admin-secret': (window.__ADMIN_SECRET__ || '') };

  async function fetchJson(path) {
    const res = await fetch(path, { headers: adminHeader });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || res.status);
    }
    return res.json();
  }

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const s = await fetchJson('/api/admin/summary');
        setSummary(s);
        const p = await fetchJson('/api/admin/purchases?limit=25');
        setPurchases(p || []);
        const sp = await fetchJson('/api/admin/spends?limit=25');
        setSpends(sp || []);
        const o = await fetchJson('/api/admin/orders?limit=25');
        setOrders(o || []);
      } catch (e) {
        console.error('admin fetch failed', e);
        alert('Admin fetch failed: ' + (e && e.message));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div style={{padding:20, maxWidth:1100, margin:'0 auto', fontFamily:'Arial, sans-serif'}}>
      <h1>Admin — Dashboard</h1>
      {loading && <div>Loading…</div>}
      {summary && (
        <div style={{display:'flex', gap:12, marginBottom:20}}>
          <div style={{padding:12, border:'1px solid #eee', borderRadius:6}}>Customers: <strong>{summary.total_customers}</strong></div>
          <div style={{padding:12, border:'1px solid #eee', borderRadius:6}}>Credits (sum): <strong>{summary.total_credits}</strong></div>
          <div style={{padding:12, border:'1px solid #eee', borderRadius:6}}>Purchases: <strong>{summary.total_purchases}</strong></div>
          <div style={{padding:12, border:'1px solid #eee', borderRadius:6}}>Spends: <strong>{summary.total_spends}</strong></div>
          <div style={{padding:12, border:'1px solid #eee', borderRadius:6}}>Orders: <strong>{summary.total_orders}</strong></div>
        </div>
      )}

      <Table title="Recent Purchases" rows={purchases} columns={['purchase_id','client_id','pack_id','amount','currency','paystack_reference','created_at']} />
      <Table title="Recent Spends" rows={spends} columns={['spend_id','order_id','client_id','credits_used','reason','created_at']} />
      <Table title="Recent Orders" rows={orders} columns={['order_id','client_id','provider','amount','credits','status','paystack_reference','created_at']} />

      <p style={{color:'#666', fontSize:13, marginTop:20}}>
        Note: Admin endpoints require the header <code>x-admin-secret</code>. Set it in your browser as <code>window.__ADMIN_SECRET__ = 'your_secret'</code> for local testing, or use curl with the header.
      </p>
    </div>
  );
}
