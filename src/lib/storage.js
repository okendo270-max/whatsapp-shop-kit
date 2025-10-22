// Minimal localStorage helper. Keep keys short. Do NOT sync to any server in MVP.
const KEY = 'wski_invoices_v1';

export function loadInvoices(){
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch(e) {
    console.error('Could not load invoices', e);
    return [];
  }
}

export function saveInvoice(inv){
  try {
    const list = loadInvoices();
    list.unshift(inv);
    // keep max 100 invoices locally by default
    const truncated = list.slice(0,100);
    localStorage.setItem(KEY, JSON.stringify(truncated));
    return true;
  } catch(e){
    console.error('Save failed', e);
    return false;
  }
}
