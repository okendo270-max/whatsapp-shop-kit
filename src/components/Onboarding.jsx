import React, { useState, useEffect } from 'react';

const KEY = 'wski_onboard_done';

export default function Onboarding({ visible, onClose }) {
  const [show, setShow] = useState(visible);

  useEffect(() => {
    const done = localStorage.getItem(KEY);
    if (done === '1') {
      setShow(false);
    } else {
      setShow(visible);
    }
  }, [visible]);

  function dismiss(permanent=false) {
    if (permanent) localStorage.setItem(KEY, '1');
    setShow(false);
    if (onClose) onClose();
  }

  if (!show) return null;

  return (
    <div style={overlay}>
      <div style={modal}>
        <h2 style={{marginTop:0}}>Welcome to WhatsApp Shop Kit</h2>
        <ol>
          <li>Paste a WhatsApp order message into the main box.</li>
          <li>Correct any parsed fields, then generate a PDF invoice.</li>
          <li>Use Settings to add your shop name, phone and payment link.</li>
        </ol>
        <div style={{display:'flex', gap:8, marginTop:12}}>
          <button className="btn" onClick={() => dismiss(false)}>Got it</button>
          <button className="btn secondary" onClick={() => dismiss(true)}>Don't show again</button>
        </div>
      </div>
    </div>
  );
}

const overlay = {
  position:'fixed', left:0, top:0, right:0, bottom:0, background:'rgba(0,0,0,0.36)',
  display:'flex', alignItems:'center', justifyContent:'center', zIndex:1200
};
const modal = {
  width:520, background:'#fff', padding:18, borderRadius:8, boxShadow:'0 12px 36px rgba(0,0,0,0.14)'
};
