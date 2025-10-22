import jsPDF from 'jspdf';
import 'jspdf-autotable';

// Create a single-page invoice PDF and return blob URL
export function makeInvoicePdf(data) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  doc.setFontSize(12);
  doc.text(`Invoice #${data.id}`, 40, 50);
  doc.setFontSize(10);
  doc.text(`Date: ${data.date}`, 40, 70);
  doc.text(`Buyer: ${data.buyerName}`, 40, 90);
  if (data.phone) doc.text(`Phone: ${data.phone}`, 40, 105);

  const body = data.items.map(i => [i.name, String(i.qty), i.unitPrice, formatLineTotal(i)]);
  doc.autoTable({
    head: [['Item', 'Qty', 'Unit', 'Line total']],
    body,
    startY: 130,
    margin: {left:40, right:40}
  });

  const finalY = doc.lastAutoTable ? doc.lastAutoTable.finalY : 200;
  const total = computeTotal(data.items);
  doc.setFontSize(12);
  doc.text(`Total: ${total}`, 40, finalY + 30);

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
  // format with two decimals
  return total.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits:2});
}

function formatLineTotal(i){
  const p = parseFloat(String(i.unitPrice).replace(/,/g, '')) || 0;
  const q = Number(i.qty) || 0;
  return (p*q).toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2});
}
