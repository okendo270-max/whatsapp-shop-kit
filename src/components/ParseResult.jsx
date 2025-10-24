import React, { useState, useEffect } from 'react';
import { makeInvoicePdf } from '../lib/invoicePdf';
import { getCustomerId, fetchCredits, useCredits } from '../lib/credits';

export default function ParseResult({ parsed, onSave, profile = {}, insertedText = '', clearInsertedText = () => {} }){
  const [invoice, setInvoice] = useState(parsed);
  const [message, setMessage] = useState('');
  const [credits, setCredits] = useState(null);

  useEffect(() => {
    setInvoice(parsed);
  }, [parsed]);

  useEffect(() => {
    if (insertedText && insertedText.length) {
      setMessage(insertedText);
      clearInsertedText();
    }
  }, [insertedText]);

  useEffect(() => {
    // load current credits for the customer if available
    const cust = getCustomerId();
    if (cust) {
      fetchCredits(cust).then(j => {
        // fetchCredits returns a number (per your helper)
        setCredits(typeof j === 'number' ? j : (j && j.credits) || 0);
      }).catch(() => {
        setCredits(null);
      });
    }
  }, []);

  function updateField(path, value){
    const copy = JSON.parse(JSON.stringify(invoice));
    const parts = path.split('.');
    let cur = copy;
    for(let i=0;i<parts.length-1;i++) cur = cur[parts[i]];
    cur[parts[parts.length-1]] = value;
    setInvoice(copy);
  }

  function handleGenerate(){
    const url = makeInvoicePdf(invoice, profile);
    // open in new tab - callers should revoke objectUrl after use if needed
    window.open(url, '_blank');
  }

  async function handleSave(){
    // Require 1 credit per invoice (configurable)
    const required = 1;
    const custId = getCustomerId();
    if (!custId) {
      if (!confirm('No payment account found. You need to buy credits to save invoices. Go to buy credits now?')) {
        return;
      }
      // redirect flow handled by CreditsButton; user should buy click separately.
      return;
    }

    try {
      // attempt to deduct credits server-side (atomic)
      const resp = await useCredits(custId, required);
      // expected success shape: { clientId, remainingCredits } (see server)
      if (resp && typeof resp.remainingCredits !== 'undefined') {
        // update local credits display (optional)
        setCredits(Number(resp.remainingCredits));
        // proceed to save locally
        onSave(invoice);
      } else {
        // unexpected success shape — show generic message
        alert('Could not confirm credit deduction. Please check your credits and try again.');
      }
    } catch (err) {
      // err may be an Error with message or an object thrown from fetch
      // our client helper throws Error with message 'insufficient_credits' for 402
      const msg = (err && (err.message || err.error || err.status)) || '';
      if (msg === 'insufficient_credits' || msg === 'Insufficient credits' || (err && err.status === 402)) {
        alert('You do not have enough credits. Please buy credits.');
      } else if (msg === 'request_timeout') {
        alert('Request timed out. Try again.');
      } else {
        console.error('useCredits failed', err);
        alert('Failed to use credits. Try again.');
      }
    }
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
        <label>Message to buyer</label>
        <textarea value={message} onChange={e=>setMessage(e.target.value)} style={{width:'100%', minHeight:80, padding:8, borderRadius:6, border:'1px solid #e6e9ef'}} />
        <div style={{marginTop:8, display:'flex', gap:8}}>
          <button className="btn" onClick={copyMessageToClipboard}>Copy message</button>
          <button className="btn secondary" onClick={() => { navigator.clipboard && navigator.clipboard.writeText(message).then(()=>alert('Message copied')).catch(()=>window.prompt('Copy manually', message)); }}>Copy (alt)</button>
        </div>
      </div>

      <div style={{marginTop:8}}>
        {credits !== null ? (
          <div style={{fontSize:13, color:'#333'}}>Your credits: <strong>{credits}</strong></div>
        ) : (
          <div style={{fontSize:13, color:'#666'}}>Credits: unknown</div>
        )}
      </div>

      <div className="row" style={{marginTop:10}}>
        <button className="btn" onClick={handleGenerate}>Open PDF</button>
        <button className="btn secondary" onClick={handleSave}>Save to local list (uses credit)</button>
      </div>
    </div>
  );
}
