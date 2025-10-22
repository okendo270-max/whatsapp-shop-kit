// templatesStorage.js
// Simple localStorage wrapper for templates (v1).
const KEY = 'wski_templates_v1';
const MAX_TEMPLATES = 200;

const DEFAULT_TEMPLATES = [
  {
    id: 'tpl_order_confirm',
    name: 'Order confirmation',
    body: 'Hi {name}, thanks for your order #{invoice_id}. Please pay {payment_link}'
  },
  {
    id: 'tpl_shipping',
    name: 'Shipping confirmation',
    body: 'Hi {name}, your order #{invoice_id} has shipped.'
  },
  {
    id: 'tpl_refund',
    name: 'Refund processed',
    body: 'Hi {name}, refund for order #{invoice_id} has been processed.'
  }
];

function uid() {
  return 't' + Math.random().toString(36).slice(2, 9);
}

export function loadTemplates() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      // write defaults
      saveTemplates(DEFAULT_TEMPLATES);
      return DEFAULT_TEMPLATES;
    }
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr) || arr.length === 0) {
      saveTemplates(DEFAULT_TEMPLATES);
      return DEFAULT_TEMPLATES;
    }
    return arr;
  } catch (e) {
    console.error('Could not load templates', e);
    saveTemplates(DEFAULT_TEMPLATES);
    return DEFAULT_TEMPLATES;
  }
}

export function saveTemplates(list) {
  try {
    const trimmed = (list || []).slice(0, MAX_TEMPLATES);
    localStorage.setItem(KEY, JSON.stringify(trimmed));
    return true;
  } catch (e) {
    console.error('Could not save templates', e);
    return false;
  }
}

export function addTemplate(obj) {
  const list = loadTemplates();
  const t = { id: uid(), name: obj.name || 'Untitled', body: obj.body || '' };
  list.unshift(t);
  saveTemplates(list);
  return t;
}

export function updateTemplate(id, obj) {
  const list = loadTemplates();
  const idx = list.findIndex(x => x.id === id);
  if (idx === -1) return false;
  list[idx] = { ...list[idx], ...obj };
  saveTemplates(list);
  return true;
}

export function deleteTemplate(id) {
  let list = loadTemplates();
  list = list.filter(x => x.id !== id);
  saveTemplates(list);
  return true;
}
