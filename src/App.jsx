import React, { useState, useEffect } from 'react';
import PasteForm from './components/PasteForm';
import ParseResult from './components/ParseResult';
import InvoiceList from './components/InvoiceList';
import { loadInvoices, saveInvoice } from './lib/storage';

export default function App(){
  const [parsed, setParsed] = useState(null);
  const [invoices, setInvoices] = useState([]);

  useEffect(() => {
    setInvoices(loadInvoices());
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

  return (
    <div className="container">
      <h1>WhatsApp Shop Kit — Invoice generator (MVP)</h1>
      <p className="lead">Paste an order message from WhatsApp. Correct parsed fields, then generate a PDF invoice.</p>

      <PasteForm onParsed={handleParsed} />

      {parsed && <ParseResult parsed={parsed} onSave={handleSave} />}

      <InvoiceList invoices={invoices} />
      <footer style={{marginTop:20, fontSize:12, color:'#666'}}>
        Local-only storage. No images uploaded. For demo purposes only.
      </footer>
    </div>
  );
}
