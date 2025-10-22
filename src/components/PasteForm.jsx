import React, { useState } from 'react';
import { parseOrder } from '../lib/parser';

export default function PasteForm({ onParsed }){
  const [text, setText] = useState('');
  const [debug, setDebug] = useState(false);

  function handleParse(){
    try {
      const result = parseOrder(text);
      onParsed(result);
    } catch (err) {
      console.error('Parse error', err);
      alert('Could not parse the text. Try a simpler message.');
    }
  }

  return (
    <div className="card">
      <textarea
        aria-label="Paste WhatsApp message"
        className="paste"
        placeholder="Paste single order message / chat snippet here..."
        value={text}
        onChange={e => setText(e.target.value)}
        rows={6}
      />
      <div className="row">
        <button onClick={handleParse} className="btn">Parse</button>
        <label style={{marginLeft:10}}>
          <input type="checkbox" checked={debug} onChange={() => setDebug(!debug)} />
          Debug
        </label>
      </div>
      {debug &&
        <div className="debug">
          <h4>Debug</h4>
          <pre>{text || 'Paste something to see raw content.'}</pre>
        </div>
      }
    </div>
  );
}
