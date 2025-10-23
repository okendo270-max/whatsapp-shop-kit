// src/components/CreditsButton.jsx
import React, { useEffect, useState } from 'react';
import { getClientId, getCustomerId, setCustomerId, createCheckoutSession, fetchCredits } from '../lib/credits';

export default function CreditsButton() {
  const [credits, setCredits] = useState(0);
  const [loading, setLoading] = useState(false);

  async function refresh() {
    const cid = getCustomerId();
    if (!cid) {
      setCredits(0);
      return;
    }
    try {
      const c = await fetchCredits(cid);
      setCredits(c);
    } catch (e) {
      console.warn('Could not fetch credits', e);
    }
  }

  useEffect(() => {
    refresh();
    // refresh every 20 seconds while component mounted
    const id = setInterval(refresh, 20000);
    return () => clearInterval(id);
  }, []);

  async function handleBuy() {
    setLoading(true);
    try {
      const clientId = getClientId();
      const customerId = getCustomerId();
      const res = await createCheckoutSession({ clientId, customerId });
      if (res.customerId) setCustomerId(res.customerId);
      if (res.url) {
        // redirect user to Stripe Checkout
        window.location.href = res.url;
      } else {
        alert('Unexpected response from payment server.');
        console.error(res);
      }
    } catch (e) {
      console.error('checkout error', e);
      alert('Payment start failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{display:'flex', alignItems:'center', gap:8}}>
      <div style={{fontSize:13, color:'#222'}}>Credits: <strong>{credits}</strong></div>
      <button className="btn" onClick={handleBuy} disabled={loading}>{loading ? '...' : 'Buy credits'}</button>
    </div>
  );
}
