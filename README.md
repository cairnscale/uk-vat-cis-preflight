# @cairnscale/uk-vat-cis-preflight

Exact pence (`BigInt`) helper for **UK VAT Act 1994 s.55A Domestic Reverse Charge (DRC)**, Construction Industry Scheme (**CIS**) labour and materials splits, crossfoot checks, and duplicate purchase ledger detection.

Interactive local browser tool: [cairnscale.uk/forensic-vat/](https://cairnscale.uk/forensic-vat/)  
Rulebook & HMRC box guide: [UK CIS & VAT s.55A Reverse Charge Guide](https://cairnscale.uk/guides/uk-cis-vat-reverse-charge-preflight/)

## Usage

```js
import { auditPurchaseLedger, parseCsv } from '@cairnscale/uk-vat-cis-preflight';

const report = auditPurchaseLedger(parseCsv(csvString));
console.log(report.totals, report.issues);
```

```sh
node index.mjs ledger-export.csv
```

Built by [cairnscale](https://cairnscale.uk/services/xero-cis-reconciliation/) (MIT License).
