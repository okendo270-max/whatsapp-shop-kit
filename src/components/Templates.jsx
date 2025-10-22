import React, { useState, useEffect } from 'react';
import { loadTemplates, addTemplate, updateTemplate, deleteTemplate } from '../lib/templatesStorage';

// props: visible (bool), onClose(), onUseTemplate(text), profile (object)
export default function Templates({ visible, onClose, onUseTemplate, profile = {} }) {
  const [list, setList] = useState([]);
  const [editing, setEditing] = useState(null); // {id, name, body} or null
  const [newName, setNewName] = useState('');
  const [newBody, setNewBody] = useState('');

  useEffect(() => {
    setList(loadTemplates());
  }, [visible]);

  function refresh() {
    setList(loadTemplates());
  }

  function handleStartAdd() {
    setEditing({ id: null, name: '', body: '' });
    setNewName('');
    setNewBody('');
  }

  function handleSaveEdit() {
    if (!editing) return;
    const name = (editing.id ? editing.name : newName).trim();
    const body = (editing.id ? editing.body : newBody).trim();
    if (!name || !body) {
      alert('Please provide both name and body.');
      return;
    }
    if (editing.id) {
      updateTemplate(editing.id, { name, body });
    } else {
      addTemplate({ name, body });
    }
    setEditing(null);
    refresh();
  }

  function handleDelete(id) {
    if (!confirm('Delete this template?')) return;
    deleteTemplate(id);
    refresh();
  }

  function fillPlaceholders(templateBody, data = {}) {
    // data: { name, invoice_id, payment_link }
    let s = templateBody || '';
    s = s.replace(/\{name\}/g, data.name || '');
    s = s.replace(/\{invoice_id\}/g, data.invoice_id || '');
    s = s.replace(/\{payment_link\}/g, data.payment_link || '');
    return s;
  }

  async function handleCopy(tpl) {
    const text = fillPlaceholders(tpl.body, { name: profile._lastName || '', invoice_id: profile._lastInvoiceId || '', payment_link: profile.paymentLink || profile.payment_link || '' });
    // try Clipboard API
    try {
      await navigator.clipboard.writeText(text);
      alert('Template copied to clipboard.');
    } catch (e) {
      // fallback: show prompt with text to copy manually
      window.prompt('Copy the template text below (Ctrl/Cmd+C):', text);
    }
  }

  function handleInsert(tpl) {
    const text = fillPlaceholders(tpl.body, { name: profile._lastName || '', invoice_id: profile._lastInvoiceId || '', payment_link: profile.paymentLink || profile.payment_link || '' });
    if (onUseTemplate) onUseTemplate(text);
    if (onClose) onClose();
  }

  if (!visible) return null;

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
          <h3 style={{margin:0}}>Templates</h3>
          <div>
            <button className="btn" onClick={handleStartAdd}>Add</button>
            <button className="btn secondary" onClick={() => { setEditing(null); onClose && onClose(); }}>Close</button>
          </div>
        </div>

        <div style={{marginTop:12, maxHeight: 360, overflow:'auto'}}>
          {list.map(t => (
            <div key={t.id} style={{padding:8, borderBottom:'1px solid #f0f3f6', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
              <div style={{flex:1}}>
                <div style={{fontWeight:600}}>{t.name}</div>
                <div style={{color:'#444', fontSize:13, marginTop:6, whiteSpace:'pre-wrap'}}>{t.body}</div>
              </div>
              <div style={{marginLeft:10, display:'flex', flexDirection:'column', gap:6}}>
                <button className="btn" onClick={() => handleCopy(t)}>Copy</button>
                <button className="btn" onClick={() => handleInsert(t)}>Insert</button>
                <button className="btn secondary" onClick={() => { setEditing(t); setNewName(t.name); setNewBody(t.body); }}>Edit</button>
                <button className="btn secondary" onClick={() => handleDelete(t.id)}>Delete</button>
              </div>
            </div>
          ))}
          {list.length === 0 && <div style={{color:'#777'}}>No templates found.</div>}
        </div>

        {editing && (
          <div style={{marginTop:12, borderTop:'1px solid #eef2f6', paddingTop:12}}>
            <h4 style={{marginTop:0}}>{editing.id ? 'Edit template' : 'Add template'}</h4>
            <div>
              <input placeholder="Template name" value={editing.id ? editing.name : newName} onChange={e => {
                if (editing.id) setEditing({...editing, name: e.target.value}); else setNewName(e.target.value);
              }} style={inputStyle} />
            </div>
            <div style={{marginTop:8}}>
              <textarea placeholder="Template body. Use {name} and {invoice_id}" value={editing.id ? editing.body : newBody} onChange={e => {
                if (editing.id) setEditing({...editing, body: e.target.value}); else setNewBody(e.target.value);
              }} style={{width:'100%', minHeight:80, padding:8, borderRadius:6, border:'1px solid #e6e9ef'}} />
            </div>
            <div style={{marginTop:8}}>
              <button className="btn" onClick={handleSaveEdit}>Save</button>
              <button className="btn secondary" onClick={() => setEditing(null)} style={{marginLeft:8}}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* small inline styles */
const overlayStyle = { position:'fixed', left:0, top:0, right:0, bottom:0, background:'rgba(0,0,0,0.35)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 };
const modalStyle = { width:720, maxHeight:'85vh', background:'#fff', padding:16, borderRadius:8, boxShadow:'0 8px 30px rgba(0,0,0,0.12)', overflow:'hidden' };
const inputStyle = { width:'100%', padding:8, borderRadius:6, border:'1px solid #e6e9ef', marginTop:6, boxSizing:'border-box' };
