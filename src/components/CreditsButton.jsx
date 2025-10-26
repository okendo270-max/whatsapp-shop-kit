// src/components/CreditsButton.jsx
import React, { useEffect, useState, useRef } from 'react';
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
  const pollRef = useRef(null);

  async function refresh() {
    const cid = getCustomerId();
    if (!cid) {
      setCredits(0);
      return;
    }
    setRefreshing(true);
    try {
      const c = await fetchCredits(cid);
      const count = (typeof c === 'number') ? c : (c && c.credits) || 0;
      setCredits(count);
      return count;
    } catch (e) {
      console.warn('Could not fetch credits', e);
      return null;
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    // initial refresh
    (async () => { await refresh(); })();

    // refresh every 20 seconds while component mounted
    const id = setInterval(refresh, 20000);
    return () => {
      clearInterval(id);
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, []);

  // Poll helper for mpesa flow: poll refresh() until credits increase or timeout
  function startMpesaPoll(prevCredits) {
    // clear existing poll if any
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }

    const start = Date.now();
    const timeoutMs = 2 * 60 * 1000; // 2 minutes max polling
    const intervalMs = 5000; // poll every 5s

    pollRef.current = setInterval(async () => {
      try {
        const current = await refresh();
        if (current != null && current > (prevCredits || 0)) {
          clearInterval(pollRef.current);
          pollRef.current = null;
          alert('Payment received — your credits have been updated.');
          return;
        }
        if (Date.now() - start > timeoutMs) {
          clearInterval(pollRef.current);
          pollRef.current = null;
          alert('We didn’t detect the payment yet. If you completed the M-PESA prompt, please wait a few moments and refresh your dashboard. You can also contact support.');
        }
      } catch (e) {
        console.warn('mpesa poll error', e);
      }
    }, intervalMs);
  }

  async function handleBuy() {
    setLoading(true);
    try {
      const clientId = getClientId();
      const customerId = getCustomerId();
      const prevCredits = credits;

      // Attempt to create a checkout session on the server
      const res = await createCheckoutSession({ clientId, customerId });

      // If server returns/updates a customer id, persist it
      if (res && (res.customerId || res.customer_id)) {
        setCustomerId(res.customerId || res.customer_id);
      }

      // Prefer explicit 'flow' field from server
      if (res && res.flow === 'card-paystack') {
        // card flow: redirect to Paystack checkout (different possible shapes)
        const url =
          (res.paystack && (res.paystack.data && res.paystack.data.authorization_url)) ||
          res.paystack?.authorization_url ||
          res.authorization_url ||
          res.url ||
          res.checkoutUrl ||
          res.checkout_url;

        if (url) {
          // use assign so user can go back
          window.location.assign(url);
          return;
        } else {
          throw new Error('Card flow: missing redirect URL');
        }
      }

      if (res && res.flow === 'mpesa-paystack') {
        // mpesa flow started server-side. Inform user and poll for credits.
        // Res may include orderId and paystack response for auditing.
        alert('M-PESA prompt sent to the phone number provided. Approve the prompt to complete payment. We will update your credits automatically once payment is confirmed.');

        // start polling for credits increase
        startMpesaPoll(prevCredits);
        return;
      }

      // Fallback: handle other common shapes (older code)
      const redirectUrl = res && (res.url || res.authorization_url || res.checkoutUrl || res.checkout_url);
      if (redirectUrl) {
        window.location.assign(redirectUrl);
        return;
      }

      if (res && res.reference && res.authorization_url) {
        window.location.assign(res.authorization_url);
        return;
      }

      // Unexpected response
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
