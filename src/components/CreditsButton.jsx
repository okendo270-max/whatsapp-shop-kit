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
    (async () => { await refresh(); })();
    const id = setInterval(refresh, 20000);
    return () => {
      clearInterval(id);
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, []);

  function startMpesaPoll(prevCredits) {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }

    const start = Date.now();
    const timeoutMs = 2 * 60 * 1000; // 2 minutes
    const intervalMs = 5000;

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

      const packId = 1;
      const savedPhone = localStorage.getItem('wski_customer_phone') || null;
      const phone = savedPhone || '+254710000000';
      const paymentMethod = 'mpesa';
      const savedEmail = localStorage.getItem('wski_customer_email') || null;
      const email = savedEmail || 'arimisbaby@gmail.com';

      const res = await createCheckoutSession({ clientId, customerId, packId, email, phone, paymentMethod });

      if (res && (res.customerId || res.customer_id)) {
        setCustomerId(res.customerId || res.customer_id);
      }

      if (res && res.flow === 'mpesa-paystack') {
        alert('M-PESA prompt sent to the phone number provided. Approve the prompt to complete payment. We will update your credits automatically once payment is confirmed.');
        startMpesaPoll(prevCredits);
        return;
      }

      if (res && res.flow === 'card-paystack') {
        const url =
          (res.paystack && (res.paystack.data && res.paystack.data.authorization_url)) ||
          res.paystack?.authorization_url ||
          res.authorization_url ||
          res.url ||
          res.checkoutUrl ||
          res.checkout_url;

        if (url) {
          window.location.assign(url);
          return;
        } else {
          throw new Error('Card flow: missing redirect URL');
        }
      }

      const redirectUrl = res && (res.url || res.authorization_url || res.checkoutUrl || res.checkout_url);
      if (redirectUrl) {
        window.location.assign(redirectUrl);
        return;
      }

      console.error('Unexpected response from payment server:', res);
      alert('Unexpected response from payment server. Check console for details.');
    } catch (e) {
      console.error('checkout error', e);
      alert('Payment start failed: ' + (e && e.message ? e.message : String(e)));
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
