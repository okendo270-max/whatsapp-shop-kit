import { useEffect, useState } from 'react';

export default function PaystackReturn() {
  const [status, setStatus] = useState('verifying');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reference = params.get('reference') || params.get('trxref') || params.get('ref');
    if (!reference) {
      setStatus('no-ref');
      setMessage('No payment reference found in the URL.');
      return;
    }

    async function verify() {
      try {
        const res = await fetch(`/api/verify-paystack-payment?reference=${encodeURIComponent(reference)}`);
        const j = await res.json();
        if (j.ok && j.verified) {
          setStatus('success');
          setMessage('Payment verified. Your credits have been updated.');
          // Optionally refresh client-side balance here:
          // await fetch(`/api/credits?clientId=...`);
        } else if (j.ok && !j.verified) {
          setStatus('failed');
          setMessage('Payment not verified yet. Try again later.');
        } else {
          setStatus('error');
          setMessage('Verify endpoint returned an error.');
          console.warn('verify response', j);
        }
      } catch (err) {
        setStatus('error');
        setMessage('Verify request failed. Try again later.');
        console.error(err);
      }
    }

    verify();
  }, []);

  return (
    <main style={{padding:32, fontFamily:'Arial, sans-serif'}}>
      <h1>Payment status</h1>
      {status === 'verifying' && <p>Verifying your payment — please wait...</p>}
      {status === 'no-ref' && <p>{message}</p>}
      {status === 'success' && <p style={{color:'green'}}>{message}</p>}
      {status === 'failed' && <p style={{color:'orange'}}>{message}</p>}
      {status === 'error' && <p style={{color:'red'}}>{message}</p>}
    </main>
  );
}
