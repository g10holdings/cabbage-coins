/**
 * Download Tony's Zoho Billing records into engine/.zoho/ (never committed: customer names and amounts), READ ONLY.
 *
 *   invoices.json   every invoice (INV-…): number, date, customer, total, balance, status
 *   quotes.json     every quote ("estimates" in the API; Tony's purchases are the PO-… ones)
 *   payments.json   every payment received: date, amount, mode, invoice
 *   details.json    each invoice's / quote's line items (which coins) and, for invoices, the payments applied
 *
 * Billing's list answers name fields differently from its detail answers (invoice list: "number"/"invoice_date";
 * payment list: "mode"); everything is saved under one set of names: number, date, changed, payment_mode, price.
 *
 * Lists are a few calls; details are one call per invoice or quote, so they're kept and only fetched again when
 * Zoho says the record changed. Zoho Billing allows 1,000 calls a day on Standard, so a run stops after --max
 * detail calls (default 600) or at Zoho's daily limit, and the next run carries on where it left off.
 *
 *   node zoho-pull.js            lists + details (up to 600 detail calls, ~2 s each)
 *   node zoho-pull.js --max 200
 *   node zoho-pull.js --lists    lists only
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { zohoGet, zohoList, zohoCallCount } from './zoho.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ZOHO_DIR = path.join(__dirname, '.zoho');
const file = (name) => path.join(ZOHO_DIR, name);
const save = (name, data) => fs.writeFileSync(file(name), JSON.stringify(data, null, 1));
const load = (name, fallback) => { try { return JSON.parse(fs.readFileSync(file(name), 'utf8')); } catch { return fallback; } };

/** One shape for list records, whatever Billing called the fields. */
export const normalize = {
  invoice: (r) => ({ id: String(r.invoice_id), number: r.invoice_number ?? r.number, date: r.date ?? r.invoice_date,
    customer_name: r.customer_name, total: r.total, balance: r.balance, status: r.status,
    changed: r.updated_time ?? r.last_modified_time ?? null }),
  quote: (r) => ({ id: String(r.estimate_id), number: r.estimate_number, date: r.date, customer_name: r.customer_name,
    total: r.total, status: r.status, reference_number: r.reference_number,
    changed: r.last_modified_time ?? r.updated_time ?? null }),
  payment: (r) => ({ id: String(r.payment_id), date: r.date, amount: r.amount, payment_mode: r.payment_mode ?? r.mode,
    status: r.status, customer_name: r.customer_name, invoice_number: r.invoice_number,
    reference_number: r.reference_number }),
};

/** A detail answer (GET invoices/{id} or estimates/{id}) → what we keep. Invoices list coins in invoice_items. */
export function detailRecord(kind, rec, listed) {
  return {
    kind, number: listed.number, changed: listed.changed, date: rec.date ?? listed.date,
    customer_name: rec.customer_name, reference_number: rec.reference_number, notes: rec.notes, total: rec.total,
    line_items: (rec.invoice_items ?? rec.line_items ?? []).map((li) => ({ name: li.name, description: li.description,
      quantity: li.quantity, price: li.price ?? li.rate, item_total: li.item_total })),
    payments: (rec.payments ?? []).map((p) => ({ payment_id: p.payment_id, date: p.date, amount: p.amount,
      payment_mode: p.payment_mode ?? p.mode, reference_number: p.reference_number, description: p.description })),
    custom_fields: (rec.custom_fields ?? []).map((c) => ({ label: c.label, value: c.value })),
  };
}

/** Records whose saved details are missing or older than the list says. */
export function needingDetails(records, details) {
  return records.filter((r) => {
    const have = details[r.id];
    return !have || (r.changed && have.changed !== r.changed);
  });
}

function summary(invoices, quotes, payments, details) {
  const range = (rows, f) => {
    const v = rows.map((r) => r[f]).filter(Boolean).sort();
    return v.length ? `${v[0]} … ${v.at(-1)}` : '-';
  };
  const count = (values) => Object.entries(values.reduce((a, v) => ((a[v ?? '?'] = (a[v ?? '?'] ?? 0) + 1), a), {}))
    .sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(', ');
  const prefix = (n) => /^[A-Za-z]+-?/.exec(n ?? '')?.[0] ?? '(none)';
  const money = (rows, f) => '$' + Math.round(rows.reduce((a, r) => a + (Number(r[f]) || 0), 0)).toLocaleString();
  const withDetail = (rows) => rows.filter((r) => details[r.id]).length;

  console.log(`\nInvoices: ${invoices.length}  numbers ${range(invoices, 'number')}  dates ${range(invoices, 'date')}`);
  console.log(`  total ${money(invoices, 'total')}; status: ${count(invoices.map((r) => r.status))}`);
  console.log(`  number styles: ${count(invoices.map((r) => prefix(r.number)))}`);
  console.log(`Quotes:   ${quotes.length}  numbers ${range(quotes, 'number')}  dates ${range(quotes, 'date')}`);
  console.log(`  total ${money(quotes, 'total')}; status: ${count(quotes.map((r) => r.status))}`);
  console.log(`  number styles: ${count(quotes.map((r) => prefix(r.number)))}`);
  console.log(`Payments received: ${payments.length}  dates ${range(payments, 'date')}  total ${money(payments, 'amount')}`);
  console.log(`  by mode: ${count(payments.map((r) => r.payment_mode))}`);
  console.log(`Line items saved for ${withDetail(invoices)}/${invoices.length} invoices and ${withDetail(quotes)}/${quotes.length} quotes.`);
}

async function main() {
  const args = process.argv.slice(2);
  const max = Number(args[args.indexOf('--max') + 1]) || 600;
  fs.mkdirSync(ZOHO_DIR, { recursive: true });

  console.log('Downloading lists from Zoho Billing…');
  const invoices = (await zohoList('invoices', 'invoices')).map(normalize.invoice);
  save('invoices.json', invoices);
  const quotes = (await zohoList('estimates', 'estimates')).map(normalize.quote);
  save('quotes.json', quotes);
  const payments = (await zohoList('payments', 'payments')).map(normalize.payment);
  save('payments.json', payments);
  console.log(`  ${invoices.length} invoices, ${quotes.length} quotes, ${payments.length} payments (${zohoCallCount()} calls)`);

  const details = load('details.json', {});
  if (!args.includes('--lists')) {
    const todo = [
      ...needingDetails(invoices, details).map((r) => ({ kind: 'invoice', r })),
      ...needingDetails(quotes, details).map((r) => ({ kind: 'estimate', r })),
    ];
    const batch = todo.slice(0, max);
    console.log(`Line items: ${todo.length} to fetch${todo.length > max ? `, doing ${max} this run (run again for the rest)` : ''}`
      + ` — about ${Math.ceil(batch.length * 2.1 / 60)} min…`);
    let done = 0;
    for (const { kind, r } of batch) {
      try {
        const j = await zohoGet(`${kind}s/${r.id}`);
        details[r.id] = detailRecord(kind, j[kind], r);
      } catch (err) {
        if (err.daily) { console.log(`  Zoho's daily call limit reached; run again tomorrow to finish. (${err.message})`); break; }
        save('details.json', details);
        throw err;
      }
      if (++done % 25 === 0) { save('details.json', details); console.log(`  ${done}/${batch.length}`); }
    }
    save('details.json', details);
  }

  summary(invoices, quotes, payments, details);
  console.log(`\n${zohoCallCount()} Zoho calls this run. Saved in ${ZOHO_DIR}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(`\n✗ ${err.message}`);
    process.exitCode = 1;
  });
}
