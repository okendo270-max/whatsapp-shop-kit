// Heuristic parser tailored for WhatsApp-style messages.
// Keep this small and deterministic so you can reason about failures.
export function parseOrder(text) {
  if (!text || typeof text !== 'string') throw new Error('Empty text');

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  // Detect phone number (simple)
  const phoneMatch = text.match(/(\+?\d{7,15})/);
  const phone = phoneMatch ? phoneMatch[1] : '';

  // Price detection regex - catches common patterns like "500", "KES 500", "$12.50"
  const priceRegex = /(?:KES|USD|GBP|\$|£)?\s?(\d{1,3}(?:[,\s]\d{3})*(?:\.\d{1,2})?)/i;

  const items = [];

  lines.forEach(line => {
    // item pattern: "2x Cool Shirt - 500"
    const itemMatch = line.match(/(\d+)\s?[xX]?\s?(.+?)\s[-–:]\s*(?:KES|USD|\$|£)?\s?([\d,\.]+)/);
    if (itemMatch) {
      items.push({
        qty: Number(itemMatch[1]),
        name: itemMatch[2].trim(),
        unitPrice: itemMatch[3].trim()
      });
      return;
    }

    // fallback: if line contains a price, assume it's one item
    const pr = line.match(priceRegex);
    if (pr && pr[1]) {
      const rawPrice = pr[0];
      const name = line.replace(rawPrice, '').replace(/[-–:]/g, '').trim() || 'Item';
      items.push({ qty: 1, name, unitPrice: pr[1] });
      return;
    }
  });

  // Try to detect buyer name: first non-price line that looks like a name
  let buyerName = '';
  for (const l of lines) {
    if (!priceRegex.test(l) && !/\d{7,15}/.test(l) && l.length > 1 && l.length < 40) {
      // skip common words like "order"
      if (!/order|total|pay|shipping|deliver/i.test(l)) {
        buyerName = l;
        break;
      }
    }
  }
  if (!buyerName) buyerName = 'Customer';

  // If no items, create a fallback
  if (items.length === 0) items.push({ qty: 1, name: 'Item', unitPrice: '0' });

  return {
    id: 'INV' + Date.now().toString(36).toUpperCase().slice(-8),
    date: new Date().toLocaleString(),
    buyerName,
    phone,
    items
  };
}
