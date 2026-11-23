import test from 'node:test';
import assert from 'node:assert/strict';
import { auditPurchaseLedger, parseCsv, parseGbpPence } from './index.mjs';

test('parseGbpPence prevents floating-point penny drift', () => {
  assert.equal(parseGbpPence('£0.10') + parseGbpPence('£0.20'), 30n);
  assert.equal(parseGbpPence('1,200.55'), 120055n);
});

test('flags s.55A erroneous supplier VAT and CIS labour/materials mismatch', () => {
  const csv = [
    'supplier,invoice_ref,tax_code,net_gbp,vat_gbp,gross_gbp,cis_labour_gbp,cis_materials_gbp',
    'Apex Joinery Ltd,INV-001,DRC20,1000.00,200.00,1200.00,800.00,200.00',
    'North Steel Ltd,INV-002,DRC20,500.00,0.00,500.00,400.00,100.00',
    'Timber Co,INV-003,STD20,200.00,40.00,240.00,0.00,0.00',
  ].join('\n');
  const res = auditPurchaseLedger(parseCsv(csv));
  assert.equal(res.rowsChecked, 3);
  assert.equal(res.issueCount, 1);
  assert.equal(res.issues[0].rule, 's55a_supplier_vat_charged');
  assert.equal(res.totals.box1OutputNotionalDrc, '£300.00');
  assert.equal(res.totals.box4InputAllowed, '£340.00');
});
