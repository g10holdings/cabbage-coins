/**
 * Deal check: reads the workbook's dealID columns (sales, purchases, inflows, outflows) and reports, READ ONLY:
 *   1. rows that belong to a deal but have no deal # yet, with the number to type (from the deal's other rows, the
 *      Zoho record, the eBay payout, or the next free D-YYMMDD-NN for that day);
 *   2. deal #s that look mistyped (not INV-000123 / PO-000045 / EB-YYMMDD / D-YYMMDD-NN, or dated far from the row);
 *   3. deals that don't balance: (sales collected + other invoiced − purchases) − (money in − money out) ≠ 0;
 *   4. trade pairs: an invoice + a PO that are one trade (the trade-in rows carry the invoice #), kept for deal analysis;
 *   5. Zoho records no row uses (a duplicate or a deal not entered yet): enter it, or mark it Declined/Void in Zoho.
 * The deal #s in the workbook are never changed or renumbered; deal-numbers.js only supplies the guesses for blanks.
 *
 *   node check-deals.js [--workbook "path\to\copy.xlsx"]
 */

import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { loadInputs, proposeDeals, tradePairs, personKey, ymd } from './deal-numbers.js';

const SHEETS = ['sales', 'purchases', 'inflows', 'outflows'];
const FORMAT = /^(INV-\d{6}|PO-\d{5,6}|EB-\d{6}(-\d+)?|D-\d{6}-\d{2})$/;   // (Zoho's very first PO is PO-00001)
const money = (v) => Number(v) || 0;
const round = (v) => Math.round(v * 100) / 100;
const dayOfNumber = (id) => {                                 // D-251107-03 / EB-251107 → that day
  const m = /^(?:D|EB)-(\d\d)(\d\d)(\d\d)/.exec(id);
  return m ? Date.UTC(2000 + +m[1], +m[2] - 1, +m[3]) / 864e5 : null;
};
const label = (r) => `${r.sheet} row ${r.row}`.padEnd(19);
const when = (day) => (day != null ? ymd(day) : 'no date   ');

/** The check itself (no printing), so it can be tested. `today` = a day number, for the next free number. */
export function checkDeals({ sheets, zohoDocs, today }) {
  const all = SHEETS.flatMap((s) => sheets[s]);
  const proposed = proposeDeals({ ...sheets, zohoDocs });     // sets r.deal (a guess) on every row; r.fixed untouched

  // The deals as the workbook has them.
  const deals = new Map();
  for (const r of all.filter((x) => x.fixed)) {
    if (!deals.has(r.fixed)) deals.set(r.fixed, { id: r.fixed, sales: [], purchases: [], inflows: [], outflows: [] });
    deals.get(r.fixed)[r.sheet].push(r);
  }
  // A grading/services invoice is a deal even before any row mentions it (unpaid: no money-in row yet).
  for (const p of proposed.values()) {
    if (p.type !== 'Coin' && !deals.has(p.id)) deals.set(p.id, { id: p.id, who: p.who, sales: [], purchases: [], inflows: [], outflows: [] });
  }
  const used = new Set(deals.keys());

  // 1. Blank rows the matcher puts in a deal → which number to type.
  const newFor = new Map();                                   // matcher's deal → number suggested for it this run
  const nextFree = (day) => {
    const stem = `D-${ymd(day).slice(2).replace(/-/g, '')}-`;
    for (let n = 1; ; n++) { const id = stem + String(n).padStart(2, '0'); if (!used.has(id)) { used.add(id); return id; } }
  };
  const missing = [];
  for (const r of all.filter((x) => !x.fixed)) {
    if (!r.deal) {
      if (/^NO MATCH/.test(r.how ?? '')) missing.push({ r, number: '', why: 'no deal found for it: type its deal # by hand' });
      continue;                                               // not a deal (expense, transfer…): stays blank
    }
    const pd = proposed.get(r.deal);
    const peers = (pd ? SHEETS.flatMap((s) => pd[s]) : []).filter((x) => x.fixed);
    const counts = peers.reduce((a, x) => a.set(x.fixed, (a.get(x.fixed) ?? 0) + 1), new Map());
    const top = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (top) { missing.push({ r, number: top, why: `joins ${top} (its other rows)` }); continue; }
    if (!newFor.has(r.deal)) {
      const zohoOrEbay = /^(INV|PO|EB)-/.test(r.deal) && !used.has(r.deal);
      if (zohoOrEbay) used.add(r.deal);
      const d = proposed.get(r.deal);
      newFor.set(r.deal, zohoOrEbay ? r.deal : nextFree(d.day ?? r.day ?? today));
    }
    const number = newFor.get(r.deal);
    const near = /not on (S+) but same person/.exec(r.how ?? '')?.[1];
    if (near) { missing.push({ r, number, why: `new deal; same person & day as ${near}: if it belongs to that deal, use ${near} and add it to the Zoho record` }); continue; }
    missing.push({ r, number, why: /^INV-/.test(number) ? 'new deal (Zoho invoice)' : /^PO-/.test(number) ? 'new deal (Zoho PO)'
      : /^EB-/.test(number) ? 'new deal (eBay payout)' : 'new deal' });
  }

  // 2. Numbers that look mistyped.
  const odd = [];
  for (const r of all.filter((x) => x.fixed)) {
    if (!FORMAT.test(r.fixed)) { odd.push({ r, why: `"${r.fixed}" isn't INV-000123, PO-000045, EB-YYMMDD or D-YYMMDD-NN` }); continue; }
    const d = dayOfNumber(r.fixed);
    if (d != null && r.day != null && Math.abs(d - r.day) > 150) odd.push({ r, why: `${r.fixed} is dated ${ymd(d)}, the row ${ymd(r.day)}` });
  }

  // 3. Balances, the same sum as the dealCheck sheet.
  const fx = (d) => d.purchases.filter((r) => /^fx\b/i.test(r.medium ?? '')).reduce((a, r) => a + money(r.amount), 0);
  for (const d of deals.values()) {
    const sum = (rows) => rows.reduce((a, r) => a + money(r.sheet === 'sales' ? r.collected : r.amount), 0);
    const p = proposed.get(d.id);
    d.type = p?.type ?? 'Coin';
    d.invoiced = d.type === 'Coin' ? 0 : money(p.invoiced);   // a grading/services invoice: the Zoho total
    d.off = round((sum(d.sales) + d.invoiced - sum(d.purchases)) - (sum(d.inflows) - sum(d.outflows) - fx(d)));
    const rows = [...d.sales, ...d.purchases, ...d.inflows, ...d.outflows];
    d.who = (d.sales[0] ?? d.purchases[0] ?? rows[0])?.who ?? d.who ?? '';
    d.day = Math.min(...rows.map((r) => r.day).filter((x) => x != null), p?.day ?? Infinity);
    if (!Number.isFinite(d.day)) d.day = null;
  }
  const personOff = new Map();
  for (const d of deals.values()) personOff.set(personKey(d.who), round((personOff.get(personKey(d.who)) ?? 0) + d.off));
  const off = [...deals.values()].filter((d) => Math.abs(d.off) >= 0.5);
  const open = off.filter((d) => Math.abs(personOff.get(personKey(d.who))) >= 0.5).sort((a, b) => (b.day ?? 0) - (a.day ?? 0));

  // 4–5. Trade pairs, and Zoho records nothing in the workbook uses.
  const pairs = tradePairs({ sales: sheets.sales, purchases: sheets.purchases, zohoDocs });
  const pairedPO = new Set(pairs.filter((p) => deals.has(p.inv)).map((p) => p.po));
  const unused = zohoDocs.filter((z) => !/^(void|declined)$/i.test(z.status ?? '') && !/sample/i.test(z.customer_name ?? '')
    && !deals.has(z.number) && !pairedPO.has(z.number) && (proposed.get(z.number)?.type ?? 'Coin') === 'Coin')
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  return { deals, missing, odd, open, pairs, unused, settledAcross: off.length - open.length, nextToday: today != null ? nextFree(today) : null };
}

function main() {
  const args = process.argv.slice(2);
  const i = args.indexOf('--workbook');
  const file = i >= 0 ? args[i + 1] : undefined;             // undefined = the real workbook (read-only)
  const { sheets, zohoDocs } = loadInputs(file);
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 864e5;
  const res = checkDeals({ sheets, zohoDocs, today });
  const $ = (v) => v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const n = res.deals.size;
  console.log(`DEAL CHECK  (reads the workbook; changes nothing)\n`);
  console.log(`${n} deals: ${n - res.open.length - res.settledAcross} balanced, ${res.settledAcross} settled across the person's other deals, ${res.open.length} open\n`);

  console.log(`ROWS WITHOUT A DEAL # (${res.missing.length})`);
  if (!res.missing.length) console.log('  none');
  for (const { r, number, why } of res.missing.sort((a, b) => (a.r.day ?? 0) - (b.r.day ?? 0))) {
    console.log(`  ${label(r)} ${when(r.day)}  ${String(r.who ?? '').padEnd(28).slice(0, 28)} ${$(money(r.amount)).padStart(11)}  ->  ${(number || '?').padEnd(12)} ${why}`);
  }

  console.log(`\nDEAL #s THAT LOOK MISTYPED (${res.odd.length})`);
  if (!res.odd.length) console.log('  none');
  for (const { r, why } of res.odd) console.log(`  ${label(r)} ${when(r.day)}  ${why}`);

  console.log(`\nOPEN DEALS (${res.open.length})  + = you're owed it (or a payment isn't entered); - = you owe it (or a sale/purchase isn't entered)`);
  if (!res.open.length) console.log('  none');
  for (const d of res.open) console.log(`  ${d.id.padEnd(12)} ${when(d.day)}  ${String(d.who).padEnd(28).slice(0, 28)} ${(d.off > 0 ? '+' : '') + $(d.off)}${d.type !== 'Coin' ? `  (${d.type})` : ''}`);

  console.log(`
TRADE PAIRS (${res.pairs.length})  one trade written as an invoice (sold) + a PO (taken in); the trade-in rows carry the invoice #`);
  if (!res.pairs.length) console.log('  none');
  for (const p of res.pairs) console.log(`  ${p.inv} + ${p.po.padEnd(10)} ${p.from === 'links' ? '(from deal-links.json)' : `(${p.coins} coin${p.coins === 1 ? '' : 's'} on both)`}`);

  console.log(`
ZOHO RECORDS NO ROW USES (${res.unused.length})  enter the deal, or mark the record Declined (PO) / Void (invoice) in Zoho`);
  if (!res.unused.length) console.log('  none');
  for (const z of res.unused) console.log(`  ${z.number.padEnd(11)} ${z.date}  ${String(z.customer_name).padEnd(28).slice(0, 28)} ${$(money(z.total)).padStart(11)}  ${z.status ?? ''}`);

  if (res.nextToday) console.log(`\nNext free number for a new deal today: ${res.nextToday}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
