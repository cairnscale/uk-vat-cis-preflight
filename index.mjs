#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/**
 * Parse a GBP decimal string (e.g. "£1,200.50", "-45.00", "800") strictly to BigInt integer pence.
 */
export function parseGbpPence(raw) {
  const cleaned = String(raw ?? '').trim().replace(/[£,\s]/g, '');
  if (!cleaned) return 0n;
  const match = cleaned.match(/^(-?)(\d+)(?:\.(\d+))?$/);
  if (!match) {
    throw new RangeError(`Invalid GBP decimal amount: "${raw}"`);
  }
  const sign = match[1] === '-' ? -1n : 1n;
  const pounds = BigInt(match[2]);
  const fracRaw = (match[3] ?? '').padEnd(2, '0');
  if (fracRaw.length > 2 && /[1-9]/.test(fracRaw.slice(2))) {
    throw new RangeError(`Sub-penny precision encountered in "${raw}"`);
  }
  const pence = BigInt(fracRaw.slice(0, 2));
  return sign * (pounds * 100n + pence);
}

export function formatPenceGbp(pence) {
  const neg = pence < 0n ? '-' : '';
  const abs = pence < 0n ? -pence : pence;
  return `${neg}£${abs / 100n}.${String(abs % 100n).padStart(2, '0')}`;
}

export function parseCsv(text) {
  const lines = String(text ?? '').replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const splitRow = (line) => {
    const cols = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        cols.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    cols.push(cur.trim());
    return cols;
  };
  const headers = splitRow(lines[0]).map((h) => h.toLowerCase().replace(/[^a-z0-9_]/g, '_'));
  return lines.slice(1).map((line) => {
    const cells = splitRow(line);
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = cells[idx] ?? '';
    });
    return obj;
  });
}

/**
 * Audit UK purchase ledger rows in exact integer pence for:
 * 1. Horizontal crossfoot (net + vat = gross)
 * 2. UK VAT Act 1994 s.55A Domestic Reverse Charge (DRC20 / DRC5 supplier VAT must be £0.00)
 * 3. CIS labour + materials reconciliation (cis_labour_gbp + cis_materials_gbp = net_gbp)
 * 4. Duplicate supplier + invoice_ref pairs
 * 5. Notional VAT Box 1 / Box 4 impact
 */
export function auditPurchaseLedger(rows) {
  const issues = [];
  const seenRefs = new Map();
  let netTotal = 0n;
  let supplierVatTotal = 0n;
  let reclaimableBox4 = 0n;
  let notionalDrcBox1 = 0n;
  let notionalDrcBox4 = 0n;

  rows.forEach((row, index) => {
    const lineNo = index + 2;
    const ref = String(row.invoice_ref || row.reference || `ROW-${lineNo}`).trim();
    const supplier = String(row.supplier || 'Unknown').trim();
    const code = String(row.tax_code || 'STD20').trim().toUpperCase();
    const net = parseGbpPence(row.net_gbp ?? row.net);
    const vat = parseGbpPence(row.vat_gbp ?? row.vat);
    const gross = parseGbpPence(row.gross_gbp ?? row.gross);
    const cisLabour = parseGbpPence(row.cis_labour_gbp ?? 0);
    const cisMaterials = parseGbpPence(row.cis_materials_gbp ?? 0);

    netTotal += net;
    supplierVatTotal += vat;

    if (net + vat !== gross) {
      issues.push({ line: lineNo, invoice_ref: ref, rule: 'crossfoot_mismatch', message: `Net (${formatPenceGbp(net)}) + VAT (${formatPenceGbp(vat)}) != Gross (${formatPenceGbp(gross)})` });
    }

    const dedupeKey = `${supplier.toLowerCase()}::${ref.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    if (seenRefs.has(dedupeKey)) {
      issues.push({ line: lineNo, invoice_ref: ref, rule: 'duplicate_invoice', message: `Duplicate invoice reference already seen at line ${seenRefs.get(dedupeKey)}` });
    } else {
      seenRefs.set(dedupeKey, lineNo);
    }

    if (cisLabour > 0n || cisMaterials > 0n) {
      if (cisLabour + cisMaterials !== net) {
        issues.push({ line: lineNo, invoice_ref: ref, rule: 'cis_split_mismatch', message: `cis_labour (${formatPenceGbp(cisLabour)}) + cis_materials (${formatPenceGbp(cisMaterials)}) != net (${formatPenceGbp(net)})` });
      }
    }

    if (code === 'DRC20' || code === 'DRC5') {
      const rate = code === 'DRC5' ? 5n : 20n;
      const notional = (net * rate + 50n) / 100n;
      notionalDrcBox1 += notional;
      notionalDrcBox4 += notional;
      if (vat !== 0n) {
        issues.push({
          line: lineNo,
          invoice_ref: ref,
          rule: 's55a_supplier_vat_charged',
          message: `VAT Act 1994 s.55A ${code} requires £0.00 supplier-charged VAT (found ${formatPenceGbp(vat)}; disallowed from Box 4 reclaim)`,
        });
      }
    } else if (code === 'STD20' || code === 'RED5') {
      const rate = code === 'RED5' ? 5n : 20n;
      const expectedVat = (net * rate + 50n) / 100n;
      const diff = vat > expectedVat ? vat - expectedVat : expectedVat - vat;
      if (diff > 1n) {
        issues.push({ line: lineNo, invoice_ref: ref, rule: 'vat_rate_variance', message: `Expected ~${formatPenceGbp(expectedVat)} for ${code}, got ${formatPenceGbp(vat)}` });
      }
      reclaimableBox4 += vat;
    } else {
      reclaimableBox4 += vat;
    }
  });

  return {
    rowsChecked: rows.length,
    issueCount: issues.length,
    issues,
    totals: {
      net: formatPenceGbp(netTotal),
      supplierVat: formatPenceGbp(supplierVatTotal),
      box1OutputNotionalDrc: formatPenceGbp(notionalDrcBox1),
      box4InputAllowed: formatPenceGbp(reclaimableBox4 + notionalDrcBox4),
      box7NetPurchases: formatPenceGbp(netTotal),
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error('Usage: uk-vat-cis-preflight <ledger.csv>');
    process.exit(1);
  }
  const rows = parseCsv(readFileSync(csvPath, 'utf8'));
  const result = auditPurchaseLedger(rows);
  console.log(JSON.stringify(result, null, 2));
  if (result.issueCount > 0) process.exitCode = 2;
}
