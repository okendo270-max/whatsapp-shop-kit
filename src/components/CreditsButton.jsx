// src/components/CreditsButton.jsx
import React, { useEffect, useState } from 'react';
import {
  getClientId,
  getCustomerId,
  setCustomerId,
  createCheckoutSession,
  fetchCredits
} from '../lib/credits';

export default function CreditsButton() {
  const [credits, setCredits] = useState(0);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  async function refresh() {
    const cid = getCustomerId();
    if (!cid) {
      setCredits(0);
      return;
    }
    setRefreshing(true);
    try {
      const c = await fetchCredits(cid);
      // fetchCredits returns number or object { credits }
      const count = (typeof c === 'number') ? c : (c && c.credits) || 0;
      setCredits(count);
    } catch (e) {
      console.warn('Could not fetch credits', e);
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    // initial refresh
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

      // server may return a new customerId to store
      if (res && (res.customerId || res.customer_id)) {
        setCustomerId(res.customerId || res.customer_id);
      }

      // support different providers: check common response fields
      const redirectUrl = res && (res.url || res.authorization_url || res.checkoutUrl || res.checkout_url);

      if (redirectUrl) {
        // redirect user to provider checkout page
        // prefer location.assign so user can go back
        window.location.assign(redirectUrl);
        return;
      }

      // some servers return an object for inline flows (token, etc.)
      if (res && res.reference && res.authorization_url) {
        // fallback
        window.location.assign(res.authorization_url);
        return;
      }

      // unexpected: show debug and keep user on page
      console.error('Unexpected response from payment server:', res);
      alert('Unexpected response from payment server. Check console for details.');
    } catch (e) {
      console.error('checkout error', e);
      alert('Payment start failed. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{display:'flex', alignItems:'center', gap:8}}>
      <div style={{fontSize:13, color:'#222'}}>
        Credits:{' '}
        <strong>{refreshing ? '...' : credits}</strong>
      </div>

      <button
        className="btn"
        onClick={handleBuy}
        disabled={loading}
        aria-busy={loading}
      >
        {loading ? 'Starting...' : 'Buy credits'}
      </button>
    </div>
  );
}
