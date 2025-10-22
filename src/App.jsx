import React, { useState, useEffect } from 'react';
import PasteForm from './components/PasteForm';
import ParseResult from './components/ParseResult';
import InvoiceList from './components/InvoiceList';
import Settings from './components/Settings';
import { loadInvoices, saveInvoice } from './lib/storage';
import { loadProfile } from './lib/profileStorage';

export default function App(){
  const [parsed, setParsed] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [profile, setProfile] = useState(loadProfile());
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    setInvoices(loadInvoices());
    setProfile(loadProfile());
  }, []);

  function handleParsed(obj) {
    setParsed(obj);
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

  return (
    <div className="container">
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <div>
          <h1 style={{margin:0}}>WhatsApp Shop Kit</h1>
          <div style={{fontSize:13, color:'#666'}}>Invoice generator (MVP)</div>
        </div>
        <div>
          <button className="btn" onClick={() => setShowSettings(true)}>Settings</button>
        </div>
      </div>

      <p className="lead">Paste an order message from WhatsApp. Correct parsed fields, then generate a PDF invoice.</p>

      <PasteForm onParsed={handleParsed} />

      {parsed && <ParseResult parsed={parsed} onSave={handleSave} profile={profile} />}

      <InvoiceList invoices={invoices} />

      <Settings visible={showSettings} onClose={() => setShowSettings(false)} onProfileChange={handleProfileChange} />

      <footer style={{marginTop:20, fontSize:12, color:'#666'}}>
        Local-only storage. No images uploaded. For demo purposes only.
      </footer>
    </div>
  );
}
