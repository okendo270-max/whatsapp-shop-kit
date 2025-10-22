import React, { useState, useEffect } from 'react';
import { loadProfile, saveProfile } from '../lib/profileStorage';

export default function Settings({ visible, onClose, onProfileChange }) {
  const [profile, setProfile] = useState(loadProfile());
  const [previewSrc, setPreviewSrc] = useState(profile.logoDataUrl || '');

  useEffect(() => {
    setProfile(loadProfile());
    setPreviewSrc(loadProfile().logoDataUrl || '');
  }, [visible]);

  function handleChange(e) {
    const { name, value } = e.target;
    setProfile(prev => ({ ...prev, [name]: value }));
  }

  function handleLogo(e) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    if (f.size > 200 * 1024) {
      alert('Logo too large. Please choose an image under 200 KB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      setPreviewSrc(dataUrl);
      setProfile(prev => ({ ...prev, logoDataUrl: dataUrl }));
    };
    reader.readAsDataURL(f);
  }

  function handleSave() {
    saveProfile(profile);
    if (onProfileChange) onProfileChange(profile);
    alert('Settings saved locally.');
    onClose && onClose();
  }

  function handleClearLogo() {
    setPreviewSrc('');
    setProfile(prev => ({ ...prev, logoDataUrl: '' }));
  }

  return !visible ? null : (
    <div style={overlayStyle}>
      <div style={modalStyle} role="dialog" aria-modal="true">
        <h3>Seller settings</h3>
        <div style={{marginBottom:8}}>
          <label>Seller name</label>
          <input name="sellerName" value={profile.sellerName} onChange={handleChange} style={inputStyle} />
        </div>
        <div style={{marginBottom:8}}>
          <label>Seller phone</label>
          <input name="sellerPhone" value={profile.sellerPhone} onChange={handleChange} style={inputStyle} />
        </div>
        <div style={{marginBottom:8}}>
          <label>Payment link (optional)</label>
          <input name="paymentLink" value={profile.paymentLink} onChange={handleChange} style={inputStyle} />
        </div>

        <div style={{marginBottom:8}}>
          <label>Logo (PNG/JPG, &lt;200 KB)</label>
          <input type="file" accept="image/png,image/jpeg" onChange={handleLogo} />
          {previewSrc ? (
            <div style={{marginTop:8, display:'flex', alignItems:'center', gap:8}}>
              <img src={previewSrc} alt="logo preview" style={{width:86, height:86, objectFit:'contain', border:'1px solid #eee', padding:6, background:'#fff'}} />
              <button onClick={handleClearLogo} className="btn secondary">Remove</button>
            </div>
          ) : <div style={{color:'#666', marginTop:6}}>No logo uploaded</div>}
        </div>

        <div style={{marginTop:12, display:'flex', gap:8}}>
          <button className="btn" onClick={handleSave}>Save</button>
          <button className="btn secondary" onClick={() => onClose && onClose()}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

/* inline styles so you don't need extra CSS */
const overlayStyle = {
  position: 'fixed', left: 0, top: 0, right:0, bottom:0,
  background: 'rgba(0,0,0,0.35)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000
};
const modalStyle = { width: 520, background:'#fff', padding:18, borderRadius:8, boxShadow:'0 6px 24px rgba(0,0,0,0.12)' };
const inputStyle = { width:'100%', padding:8, borderRadius:6, border:'1px solid #e6e9ef', marginTop:6, boxSizing:'border-box' };
