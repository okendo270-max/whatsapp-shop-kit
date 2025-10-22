// csvUtil.js
// Utility to build Excel-friendly CSV with BOM and safe quoting.

export function buildCsv(rows, headers) {
  // rows: array of objects (same keys as headers)
  // headers: array of header keys in desired order
  const lines = [];
  lines.push(headers.join(','));
  for (const r of rows) {
    const vals = headers.map(h => {
      const v = (r[h] === undefined || r[h] === null) ? '' : String(r[h]);
      // escape double quotes
      return `"${v.replace(/"/g, '""')}"`;
    });
    lines.push(vals.join(','));
  }
  // prepend UTF-8 BOM so Excel recognises UTF-8
  const bom = '\uFEFF';
  return bom + lines.join('\n');
}
