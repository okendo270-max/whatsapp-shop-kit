import jsPDF from 'jspdf';
import 'jspdf-autotable';

// Create a single-page invoice PDF and return blob URL
// signature: makeInvoicePdf(data, profile)
// profile: { sellerName, sellerPhone, paymentLink, logoDataUrl }
export function makeInvoicePdf(data, profile = {}) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const left = 40;
  const top = 40;

  // Add logo if present (try-catch in case of invalid image)
  try {
    if (profile.logoDataUrl) {
      // try to add image (png/jpeg dataURL)
      doc.addImage(profile.logoDataUrl, 'PNG', left, top, 80, 80);
    } else {
      // draw a simple placeholder "box" and initials if no logoDataUrl
      doc.setFillColor(245, 245, 250);
      doc.roundedRect(left, top, 80, 80, 6, 6, 'F');
      doc.setFontSize(18);
      doc.setTextColor(90, 90, 95);
      const initials = (profile.sellerName || '').split(' ').map(s=>s[0]).join('').slice(0,2).toUpperCase() || 'SS';
      // center initials
      const textWidth = doc.getTextWidth(initials);
      doc.text(initials, left + 40 - textWidth/2, top + 48);
    }
  } catch (e) {
    // silent fallback
    console.warn('Could not add logo to PDF', e);
    doc.setFontSize(12);
    doc.text(profile.sellerName || 'Seller', left, top + 20);
  }

  // Seller name to right of logo (or left if no logo)
  const sellerX = profile.logoDataUrl ? left + 90 : left;
  doc.setFontSize(14);
  if (profile.sellerName) {
    doc.text(`${profile.sellerName}`, sellerX, top + 20);
  } else {
    doc.text('Seller', sellerX, top + 20);
  }
  doc.setFontSize(10);
  if (profile.sellerPhone) doc.text(`Phone: ${profile.sellerPhone}`, sellerX, top + 38);
  if (profile.paymentLink) doc.text(`Pay: ${profile.paymentLink}`, sellerX, top + 56);

  // Invoice header info
  doc.setFontSize(12);
  doc.text(`Invoice #${data.id}`, 40, top + 110);
  doc.setFontSize(10);
  doc.text(`Date: ${data.date}`, 40, top + 128);
  doc.text(`Buyer: ${data.buyerName}`, 40, top + 144);
  if (data.phone) doc.text(`Phone: ${data.phone}`, 40, top + 160);

  // Table of items
  const body = data.items.map(i => [i.name, String(i.qty), i.unitPrice, formatLineTotal(i)]);
  doc.autoTable({
    head: [['Item', 'Qty', 'Unit', 'Line total']],
    body,
    startY: top + 180,
    margin: {left:40, right:40}
  });

  const finalY = doc.lastAutoTable ? doc.lastAutoTable.finalY : top + 220;
  const total = computeTotal(data.items);
  doc.setFontSize(12);
  doc.text(`Total: ${total}`, 40, finalY + 30);

  // footer: small seller payment link if present
  if (profile.paymentLink) {
    doc.setFontSize(9);
    doc.text(`Payment: ${profile.paymentLink}`, 40, finalY + 52);
  }

  const pdfBlob = doc.output('blob');
  return URL.createObjectURL(pdfBlob);
}

function computeTotal(items){
  let total = 0;
  items.forEach(i => {
    const p = parseFloat(String(i.unitPrice).replace(/,/g, '')) || 0;
    const q = Number(i.qty) || 0;
    total += p * q;
  });
  return total.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits:2});
}

function formatLineTotal(i){
  const p = parseFloat(String(i.unitPrice).replace(/,/g, '')) || 0;
  const q = Number(i.qty) || 0;
  return (p*q).toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2});
}
