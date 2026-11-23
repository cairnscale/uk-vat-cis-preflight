# @cairnscale/uk-vat-cis-preflight

Zero-dependency integer-pence (`BigInt`) validator for **UK VAT Act 1994 s.55A Domestic Reverse Charge (DRC)**, Construction Industry Scheme (**CIS**) labour/materials splits, horizontal crossfooting, and duplicate purchase ledger detection.

Interactive zero-upload browser edition: [cairnscale.uk/forensic-vat/](https://cairnscale.uk/forensic-vat/)  
Full rulebook & HMRC box guide: [UK CIS & VAT s.55A Reverse Charge Pre-Flight Guide](https://cairnscale.uk/guides/uk-cis-vat-reverse-charge-preflight/)

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
