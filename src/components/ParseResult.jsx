import React, { useState, useEffect } from 'react';
import { makeInvoicePdf } from '../lib/invoicePdf';

export default function ParseResult({ parsed, onSave, profile = {}, insertedText = '', clearInsertedText = () => {} }){
  const [invoice, setInvoice] = useState(parsed);
  const [message, setMessage] = useState(''); // message you will send to buyer

  useEffect(() => {
    setInvoice(parsed);
  }, [parsed]);

  // When Templates sets insertText in App, this prop will change and we populate message.
  useEffect(() => {
    if (insertedText && insertedText.length) {
      setMessage(insertedText);
      // let parent clear the transient
      clearInsertedText();
    }
  }, [insertedText]);

  function updateField(path, value){
    const copy = JSON.parse(JSON.stringify(invoice));
    const parts = path.split('.');
    let cur = copy;
    for(let i=0;i<parts.length-1;i++) cur = cur[parts[i]];
    cur[parts[parts.length-1]] = value;
    setInvoice(copy);
  }

  function handleGenerate(){
    try {
      const url = makeInvoicePdf(invoice, profile);
      const newWindow = window.open(url, '_blank');
      if (!newWindow) {
        alert('Please allow popups to view the PDF');
      }
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (err) {
      console.error('PDF generation error:', err);
      alert('Error generating PDF. Check console for details.');
    }
  }

  function handleSave(){
    onSave(invoice);
  }

  async function copyMessageToClipboard() {
    if (!message) {
      alert('No message to copy.');
      return;
    }
    try {
      await navigator.clipboard.writeText(message);
      alert('Message copied to clipboard.');
    } catch (e) {
      // fallback: prompt
      window.prompt('Copy message manually:', message);
    }
  }

  return (
    <div className="card">
      <h3>Parsed invoice</h3>

      <div className="field">
        <label>Buyer name</label>
        <input value={invoice.buyerName} onChange={e=>updateField('buyerName', e.target.value)} />
      </div>
      <div className="field">
        <label>Phone</label>
        <input value={invoice.phone} onChange={e=>updateField('phone', e.target.value)} />
      </div>

      <h4>Items</h4>
      {invoice.items.map((it, i) => (
        <div key={i} className="item-row">
          <input value={it.name} onChange={e => { const copy = [...invoice.items]; copy[i].name = e.target.value; setInvoice({...invoice, items: copy}); }} />
          <input style={{width:70}} value={it.qty} onChange={e => { const copy = [...invoice.items]; copy[i].qty = e.target.value; setInvoice({...invoice, items: copy}); }} />
          <input style={{width:120}} value={it.unitPrice} onChange={e => { const copy = [...invoice.items]; copy[i].unitPrice = e.target.value; setInvoice({...invoice, items: copy}); }} />
        </div>
      ))}

      <div style={{marginTop:10}}>
        <label>Message to buyer (you can insert a template via the Templates button)</label>
        <textarea value={message} onChange={e=>setMessage(e.target.value)} style={{width:'100%', minHeight:80, padding:8, borderRadius:6, border:'1px solid #e6e9ef'}} />
        <div style={{marginTop:8, display:'flex', gap:8}}>
          <button className="btn" onClick={copyMessageToClipboard}>Copy message</button>
          <button className="btn secondary" onClick={() => { navigator.clipboard && navigator.clipboard.writeText(message).then(()=>alert('Message copied')).catch(()=>window.prompt('Copy manually', message)); }}>Copy (alt)</button>
        </div>
      </div>

      <div className="row" style={{marginTop:10}}>
        <button className="btn" onClick={handleGenerate}>Open PDF</button>
        <button className="btn secondary" onClick={handleSave}>Save to local list</button>
      </div>
    </div>
  );
}
