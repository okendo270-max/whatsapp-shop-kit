import React from 'react';
import { loadInvoices } from '../lib/storage';

export default function InvoiceList(){
  const invoices = loadInvoices();

  function handleExportCSV(){
    const rows = invoices.map(inv => {
      return {
        id: inv.id,
        date: inv.date,
        buyer: inv.buyerName,
        phone: inv.phone,
        items: inv.items.map(i=>`${i.qty}x ${i.name}@${i.unitPrice}`).join('; '),
      };
    });
    const csv = [
      Object.keys(rows[0] || {id:'id',date:'date',buyer:'buyer',phone:'phone',items:'items'}).join(','),
      ...rows.map(r => Object.values(r).map(v => `"${String(v).replace(/"/g,'""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
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
      <button className="btn" onClick={handleExportCSV}>Export CSV</button>
      <ul>
        {invoices.map(inv => (
          <li key={inv.id}>
            <strong>{inv.id}</strong> • {inv.date} • {inv.buyerName} • {inv.items.length} item(s)
          </li>
        ))}
      </ul>
    </div>
  );
}
