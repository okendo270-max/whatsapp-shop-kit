import React from 'react';
import { loadInvoices } from '../lib/storage';
import { loadProfile } from '../lib/profileStorage';
import { buildCsv } from '../lib/csvUtil';

export default function InvoiceList(){
  const invoices = loadInvoices();
  const profile = loadProfile();

  function handleExportCSV(){
    if (!invoices || invoices.length === 0) {
      alert('No invoices to export.');
      return;
    }

    const rows = invoices.map(inv => ({
      id: inv.id,
      date: inv.date,
      buyer: inv.buyerName,
      phone: inv.phone,
      items: inv.items.map(i => `${i.qty}x ${i.name}@${i.unitPrice}`).join('; '),
      sellerName: profile.sellerName || '',
      sellerPaymentLink: profile.paymentLink || ''
    }));

    const headers = ['id','date','buyer','phone','items','sellerName','sellerPaymentLink'];
    const csvText = buildCsv(rows, headers);
    const blob = new Blob([csvText], {type:'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'invoices.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  if (invoices.length === 0) return <div className="card"><p>No saved invoices yet.</p></div>;

  return (
    <div className="card">
      <h3>Saved invoices</h3>
      <div style={{marginBottom:8, color:'#555', fontSize:13}}>CSV export includes your seller name and payment link (local only).</div>
      <button className="btn" onClick={handleExportCSV}>Export CSV</button>
      <ul>
        {invoices.map(inv => (
          <li key={inv.id} style={{marginTop:8}}>
            <strong>{inv.id}</strong> • {inv.date} • {inv.buyerName} • {inv.items.length} item(s)
          </li>
        ))}
      </ul>
    </div>
  );
}
