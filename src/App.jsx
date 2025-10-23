import React, { useState, useEffect } from 'react';
import PasteForm from './components/PasteForm';
import ParseResult from './components/ParseResult';
import InvoiceList from './components/InvoiceList';
import Settings from './components/Settings';
import Templates from './components/Templates';
import Onboarding from './components/Onboarding';
import CreditsButton from './components/CreditsButton';
import { loadInvoices, saveInvoice } from './lib/storage';
import { loadProfile } from './lib/profileStorage';

export default function App(){
  const [parsed, setParsed] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [profile, setProfile] = useState(loadProfile());
  const [showSettings, setShowSettings] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [insertText, setInsertText] = useState('');
  const [showOnboard, setShowOnboard] = useState(false);

  useEffect(() => {
    setInvoices(loadInvoices());
    setProfile(loadProfile());
    // show onboarding if not dismissed
    const done = localStorage.getItem('wski_onboard_done');
    setShowOnboard(done !== '1');
  }, []);

  function handleParsed(obj) {
    setParsed(obj);
    const p = loadProfile();
    p._lastName = obj.buyerName || '';
    p._lastInvoiceId = obj.id || '';
    setProfile(p);
  }

  function handleSave(invoice) {
    saveInvoice(invoice);
    setInvoices(loadInvoices());
    setParsed(null);
    alert('Invoice saved locally. You can export it or generate another.');
  }

  function handleProfileChange(newProfile) {
    setProfile(newProfile);
  }

  function handleUseTemplate(text) {
    setInsertText(text || '');
  }

  function clearInsertedText() {
    setInsertText('');
  }

  return (
    <div className="container">
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <div>
          <h1 style={{margin:0}}>{profile.sellerName ? `${profile.sellerName}` : 'WhatsApp Shop Kit'}</h1>
          <div style={{fontSize:13, color:'#666'}}>Invoice generator (MVP)</div>
        </div>
        <div style={{display:'flex', gap:8, alignItems:'center'}}>
          <CreditsButton />
          <button className="btn" onClick={() => setShowTemplates(true)}>Templates</button>
          <button className="btn" onClick={() => setShowSettings(true)}>Settings</button>
        </div>
      </div>

      <p className="lead">Paste an order message from WhatsApp. Correct parsed fields, then generate a PDF invoice.</p>

      <PasteForm onParsed={handleParsed} />

      {parsed && <ParseResult parsed={parsed} onSave={handleSave} profile={profile} insertedText={insertText} clearInsertedText={clearInsertedText} />}

      <InvoiceList invoices={invoices} />

      <Settings visible={showSettings} onClose={() => setShowSettings(false)} onProfileChange={handleProfileChange} />
      <Templates visible={showTemplates} onClose={() => setShowTemplates(false)} onUseTemplate={handleUseTemplate} profile={profile} />

      <Onboarding visible={showOnboard} onClose={() => setShowOnboard(false)} />

      <footer style={{marginTop:20, fontSize:12, color:'#666'}}>
        Local-only storage. No images uploaded. For demo purposes only.
      </footer>
    </div>
  );
}
