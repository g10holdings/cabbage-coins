/**
 * Deal numbers: tie every sale, purchase, money-in and money-out row of the workbook to ONE deal. PROPOSAL ONLY.
 *
 * Reads a workbook (default: the real one, via a throwaway copy; never written) and the Zoho Billing data saved by
 * zoho-pull.js, and writes .zoho/deal-proposal.json, which write-deal-copy.ps1 puts into a TEST COPY of the workbook.
 *
 * A deal is one transaction with one person: the coins sold, the coins taken in trade, and the money that changed
 * hands. It balances when (sales collected − purchases) − (money in − money out) = 0.
 *
 * Deal numbers, in order of trust:
 *   1. Zoho: INV-000123 (sales) / PO-000045 (purchases, made on the Quotes screen). Each Zoho coin line is matched to
 *      its workbook row by the cert # in the line ("… / #12345678"); lines without one by person + amount.
 *   2. Rows with the same person on the same day as a Zoho deal join it (trades: within 3 days) — flagged, since
 *      they weren't on the Zoho record.
 *   3. Everything else (paper slips at shows, pre-Zoho deals): D-YYMMDD-NN, one per person per day, sales and
 *      purchases together (that's a trade).
 *   Money in (inflows) follows the coin in its inventoryID; otherwise person + date. Money out (outflows, "Inventory")
 *   matches a deal with purchases by person + date, preferring the exact amount owed.
 * Purchases marked Transfer = Y (moved in from G10 Solutions) and non-inventory money rows get no deal.
 *
 *   node deal-numbers.js [--workbook "path\to\copy.xlsx"]
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import * as XLSX from 'xlsx';
import { readWorkbookSheets } from './workbook.js';
import { ZOHO_DIR } from './zoho-pull.js';

const DAY = 864e5;

/** A date (Excel serial number, Date, or "YYYY-MM-DD") as a whole day number; null if none. */
export function toDay(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Math.round(v) - 25569;                 // Excel counts from 1899-12-30
  if (v instanceof Date) return Math.round(v.getTime() / DAY);
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(v));
  return m ? Math.round(Date.parse(m[1]) / DAY) : null;
}
export const ymd = (day) => new Date(day * DAY).toISOString().slice(0, 10);

/** Inventory IDs compared without case, a leading "#" or leading zeros ("01234567" = "1234567"). */
export const normId = (v) => String(v ?? '').trim().toUpperCase().replace(/^#/, '').replace(/^0+(?=\d)/, '');
/** The coin behind a back-in-stock row: "8314282_2" → "8314282". */
export const baseId = (v) => normId(v).replace(/_\d+$/, '');

/** "#…" numbers in a Zoho line ("1924-D 25C … / #12345678"); short ones like "#85 of 230" are skipped. */
export function certsIn(text) {
  return [...String(text ?? '').matchAll(/#\s*([A-Za-z0-9][A-Za-z0-9_-]*)/g)].map((m) => m[1]).filter((c) => c.length >= 3);
}

// "K&K", "R&T" stay one word (kk, rt) so different "X&Y Coins" shops don't look alike; other "&" = "and".
const words = (s) => String(s ?? '').toLowerCase().replace(/\b([a-z])\s*&\s*([a-z])\b/g, '$1$2').replace(/&/g, ' and ')
  .replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
export const personKey = (s) => words(s).join(' ');

const STOP = new Set(['and', 'the', 'of', 'llc', 'inc', 'co', 'company', 'corp']);
// Words that say what a shop sells, not who it is: a name made only of these ("Rare Coins") identifies nobody.
const GENERIC = new Set(['coin', 'rare', 'numismatic', 'numis', 'collectible', 'gold', 'silver', 'bullion', 'exchange',
  'shop', 'store', 'currency', 'auction', 'mint', 'metal']);
const NICK = { tony: 'anthony', rick: 'richard', dick: 'richard', rich: 'richard', bob: 'robert', rob: 'robert',
  bill: 'william', will: 'william', mike: 'michael', jim: 'james', jimmy: 'james', joe: 'joseph', dave: 'david',
  tom: 'thomas', chris: 'christopher', matt: 'matthew', dan: 'daniel', danny: 'daniel', steve: 'steven',
  greg: 'gregory', ed: 'edward', ted: 'edward', ken: 'kenneth', ron: 'ronald', don: 'donald', jeff: 'jeffrey',
  pat: 'patrick', andy: 'andrew', drew: 'andrew', nick: 'nicholas', sam: 'samuel', ben: 'benjamin', alex: 'alexander' };
const stem = (w) => NICK[w] ?? (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);

/** The ways a name can be written: "Lakeside Numismatics (Victor Lane)" → the shop, the person, and both together. */
function aliases(name) {
  const s = String(name ?? '');
  const parts = [s.replace(/\([^)]*\)/g, ' '), ...[...s.matchAll(/\(([^)]*)\)/g)].map((m) => m[1]), s];
  return parts.map((p) => words(p).filter((w) => w.length > 1 && !STOP.has(w)).map(stem))
    .filter((a) => a.length && !a.every((w) => GENERIC.has(w)));
}

function sameAlias(x, y) {
  if (x.join(' ') === y.join(' ') || x.join('') === y.join('')) return true;           // "LibertyBellCoins"
  if (x.length >= 2 && y.length >= 2 && x.at(-1) === y.at(-1) && x[0][0] === y[0][0]) return true;   // middle initial
  const [s, l] = x.length <= y.length ? [x, y] : [y, x];
  if (s.length >= 2 && s.every((w) => l.includes(w))) return true;                    // an extra word ("LLC", a city)
  // initials: "MVRC" = Mill Valley Rare Coin
  return s.length === 1 && s[0].length >= 3 && l.length === s[0].length && l.map((w) => w[0]).join('') === s[0];
}

// Names Tony says are one person though they look different ("Richard X" = "Monroe X"). Kept in the gitignored
// .zoho/same-people.json as [["name", "other name", …], …] — never in code (the repo is public).
let SAME_GROUP = new Map();
// Zoho records Tony says are one deal; the first number is kept (set from .zoho/deal-links.json).
let DEAL_LINKS = [];
export function setDealLinks(groups) { DEAL_LINKS = groups; }
export function setSamePeople(groups) {
  SAME_GROUP = new Map();
  groups.forEach((g, i) => g.forEach((n) => aliases(n).forEach((a) => SAME_GROUP.set(a.join(' '), i))));
}
const groupOf = (name) => aliases(name).map((a) => SAME_GROUP.get(a.join(' '))).find((g) => g != null);

/** Same person or business, however it was typed (see aliases / sameAlias, plus Tony's same-people list). */
export function samePerson(a, b) {
  const xs = aliases(a), ys = aliases(b);
  if (xs.some((x) => ys.some((y) => sameAlias(x, y)))) return true;
  const ga = groupOf(a);
  return ga != null && ga === groupOf(b);
}

// Zoho invoice lines that aren't coins. An invoice is Grading/Services only when EVERY line matches.
const GRADING = /grading|submission|\bCAC S-|\bPCGS\b.*\bfee|\bNGC\b.*\bfee/i;
const NON_COIN = /grading|submission|\bCAC S-|consult|handling fee|user access|subscription|\bfees?\b/i;

const sumOf = (rows, f) => rows.reduce((a, r) => a + (Number(r[f]) || 0), 0);
const near = (a, b, days) => a != null && b != null && Math.abs(a - b) <= days;
const money = (v) => Number(v) || 0;
const sameMoney = (a, b) => Math.abs(money(a) - money(b)) < 0.5;
const isTrade = (medium) => /trade/i.test(medium ?? '');

/**
 * The proposal. Inputs are plain rows: { row (Excel row), id, day, who, amount, medium, … } per sheet, plus the Zoho
 * records (details.json values with kind/number/date/customer_name/line_items, and list status).
 */
export function proposeDeals({ sales, purchases, inflows, outflows, zohoDocs }) {
  const deals = new Map();
  const newDeal = (id, source, who, day) => {
    const d = { id, type: 'Coin', source, who, day, sales: [], purchases: [], inflows: [], outflows: [], unmatchedLines: [] };
    deals.set(id, d);
    return d;
  };
  const assign = (r, d, how) => { r.deal = d.id; r.how = how; d[r.sheet].push(r); };
  const people = (d) => [d.who, ...d.sales.map((r) => r.who), ...d.purchases.map((r) => r.who)];
  const days = (d) => [d.day, ...d.sales.map((r) => r.day), ...d.purchases.map((r) => r.day)].filter((x) => x != null);

  // 1. Zoho invoices → sales, Zoho quotes (POs) → purchases, coin by coin.
  for (const doc of [...zohoDocs].sort((a, b) => toDay(a.date) - toDay(b.date))) {
    if (doc.status === 'void') continue;
    const pool = doc.kind === 'invoice' ? sales : purchases;
    const d = newDeal(doc.number, 'Zoho', doc.customer_name, toDay(doc.date));
    for (const li of doc.line_items) {
      // A negative line is the other side of a trade: on a PO, a coin Tony gave (a sale); on an invoice, a coin he took
      // in (a purchase). Looking in the wrong sheet once tied a coin to whoever had sold it to Tony weeks earlier.
      const price = Number(li.price ?? li.rate ?? li.item_total) || 0;
      const lpool = price >= 0 ? pool : (doc.kind === 'invoice' ? purchases : sales);
      let hit = null;
      for (const cert of certsIn(`${li.description ?? ''} ${li.name ?? ''}`)) {
        const c = lpool.filter((r) => !r.deal && baseId(r.id) === baseId(cert) && near(r.day, d.day, 60));
        hit = c.sort((a, b) => Math.abs(a.day - d.day) - Math.abs(b.day - d.day))[0];
        if (hit) { assign(hit, d, `Zoho ${doc.number}: cert #`); break; }
      }
      if (hit) continue;
      hit = lpool.filter((r) => !r.deal && samePerson(r.who, doc.customer_name) && near(r.day, d.day, 21)
        && sameMoney(r.amount, Math.abs(price))).sort((a, b) => Math.abs(a.day - d.day) - Math.abs(b.day - d.day))[0];
      if (hit) assign(hit, d, `Zoho ${doc.number}: name + amount`);
      else d.unmatchedLines.push(`${li.name ?? ''} ${li.description ?? ''}`.trim());
    }
  }

  // 1b. Invoices that aren't coin sales: grading reimbursements (CAC/PCGS fees) and services (consulting, access,
  //     handling fees). No coins expected; the check is whether the invoice was paid. Coin deals have type Coin.
  for (const doc of zohoDocs) {
    const d = deals.get(doc.number);
    if (!d || doc.kind !== 'invoice' || d.sales.length || !doc.line_items.length) continue;
    const lines = doc.line_items.map((li) => `${li.name ?? ''} ${li.description ?? ''}`);
    if (!lines.every((t) => NON_COIN.test(t))) continue;
    d.type = lines.some((t) => GRADING.test(t)) ? 'Grading' : 'Services';
    d.invoiced = money(doc.total);
    d.unmatchedLines = [];
  }
  const nonCoin = [...deals.values()].filter((d) => d.type !== 'Coin');

  // 1c. A trade sometimes got TWO Zoho records: an invoice for the coins Tony sold and a PO for the coins he took in,
  //     same person, within 3 days, the invoice paid by Trade (an invoice paid by wire
  //     next to a trade PO is a separate deal). That's one deal: it keeps the invoice number.
  const docOf = new Map(zohoDocs.map((z) => [z.number, z]));
  //     Tony's links list (.zoho/deal-links.json, [["INV-000123", "PO-000045"], …]) joins records the rule can't see
  //     (coins handed over a week after the sale).
  const linkedTo = new Map();
  for (const g of DEAL_LINKS) for (const n of g.slice(1)) linkedTo.set(n, g[0]);
  for (const po of [...deals.values()].filter((d) => d.source === 'Zoho' && (linkedTo.has(d.id) || docOf.get(d.id)?.kind !== 'invoice'))) {
    const inv = linkedTo.has(po.id) ? deals.get(linkedTo.get(po.id))
      : [...deals.values()].filter((d) => d.source === 'Zoho' && d.type === 'Coin' && docOf.get(d.id)?.kind === 'invoice'
        && samePerson(d.who, po.who) && near(d.day, po.day, 3)
        && isTrade(docOf.get(d.id).reference_number))   // the INVOICE says it was paid (partly) by trade
        .sort((a, b) => Math.abs(a.day - po.day) - Math.abs(b.day - po.day))[0];
    if (!inv || inv === po) continue;
    for (const s of ['sales', 'purchases', 'inflows', 'outflows']) {
      for (const r of po[s]) { r.deal = inv.id; r.how = `${r.how} (trade: ${po.id} is part of ${inv.id})`; inv[s].push(r); }
    }
    inv.unmatchedLines.push(...po.unmatchedLines.map((l) => `${po.id}: ${l}`));
    inv.linked = [...(inv.linked ?? []), po.id];
    deals.delete(po.id);
  }

  // 2. Same person, same day (trades: 3 days) as a Zoho deal → that deal.
  const zohoDeals = [...deals.values()].filter((d) => d.type === 'Coin');
  for (const r of [...sales, ...purchases].filter((x) => !x.deal && !x.transfer)) {
    const win = isTrade(r.medium) ? 3 : 0;
    const d = zohoDeals.filter((z) => people(z).some((p) => samePerson(p, r.who)) && days(z).some((x) => near(x, r.day, win)))
      .sort((a, b) => Math.abs(a.day - r.day) - Math.abs(b.day - r.day))[0];
    if (d) assign(r, d, `same person & day as ${d.id} (not on the Zoho record)`);
  }

  // 3. The rest: one made-up deal per person per day (a sale and a purchase together = a trade).
  const groups = new Map();
  for (const r of [...sales, ...purchases]) {
    if (r.deal) continue;
    if (r.transfer) { r.how = 'transfer from G10 Solutions (not a deal)'; continue; }
    const key = r.day != null && personKey(r.who) ? `${r.day}|${personKey(r.who)}` : `row|${r.sheet}|${r.row}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  const perDay = new Map();
  for (const rows of [...groups.values()].sort((a, b) => (a[0].day ?? 0) - (b[0].day ?? 0) || a[0].row - b[0].row)) {
    const day = rows[0].day;
    const n = (perDay.get(day) ?? 0) + 1;
    perDay.set(day, n);
    const id = `D-${day != null ? ymd(day).slice(2).replace(/-/g, '') : 'NODATE'}-${String(n).padStart(2, '0')}`;
    const d = newDeal(id, 'made up', rows[0].who, day);
    for (const r of rows) assign(r, d, rows.some((x) => x.sheet !== r.sheet) ? 'made-up deal (trade: sale + purchase same day)' : 'made-up deal (no Zoho record)');
  }

  // 4. Money in: the coin it names → that coin's deal; otherwise person + date.
  const saleById = new Map(sales.map((r) => [normId(r.id), r]));
  const withSales = [...deals.values()].filter((d) => d.sales.length);
  for (const r of inflows) {
    if (/reimbursement|services rendered/i.test(r.category ?? '')) {
      // Paying a grading/services invoice: same person, exact amount, within 45 days after it (or a few days before).
      const d = nonCoin.filter((x) => !x.inflows.length && samePerson(x.who, r.who) && sameMoney(x.invoiced, r.amount)
        && r.day != null && r.day >= x.day - 3 && r.day <= x.day + 45).sort((a, b) => Math.abs(a.day - r.day) - Math.abs(b.day - r.day))[0];
      if (d) { assign(r, d, `pays ${d.id} (${d.type}): name + amount`); continue; }
      r.how = `not a deal (${r.category}; no Zoho invoice)`;
      continue;
    }
    if (!/sale of inventory/i.test(r.category ?? '')) { r.how = `not a deal (${r.category ?? 'no category'})`; continue; }
    const coin = saleById.get(normId(r.id)) ?? sales.find((s) => baseId(s.id) === baseId(r.id) && near(s.day, r.day, 60));
    if (coin?.deal) { assign(r, deals.get(coin.deal), `via coin #${coin.id}`); continue; }
    const d = withSales.filter((x) => people(x).some((p) => samePerson(p, r.who)) && days(x).some((y) => near(y, r.day, 14)))
      .sort((a, b) => Math.abs(a.day - r.day) - Math.abs(b.day - r.day))[0];
    if (d) assign(r, d, 'by name + date (check)');
    else r.how = 'NO MATCH: no sale for this person within 14 days';
  }

  // 5. Money out for inventory. An exact amount owed can be up to 120 days away (auction houses are paid weeks
  //    later); so can a person's payments made within a week of each other that add up to it ("paid in parts").
  //    Otherwise the nearest deal with that person within 14 days, marked for checking.
  const withPurchases = [...deals.values()].filter((d) => d.purchases.length);
  const owed = (d) => d.purchases.reduce((a, r) => a + money(r.amount), 0) - d.sales.reduce((a, r) => a + money(r.collected), 0)
    - d.outflows.reduce((a, r) => a + money(r.amount), 0);
  const isInventory = (r) => /^inventory$/i.test(r.category ?? '');
  const byDay = [...outflows].sort((a, b) => (a.day ?? 0) - (b.day ?? 0));
  for (const r of byDay) {
    if (!isInventory(r)) { r.how = `not a deal (${r.category ?? 'no category'}${r.minor ? ` / ${r.minor}` : ''})`; continue; }
    if (r.deal) continue;                                    // already placed as part of a split payment
    const cands = withPurchases.filter((d) => people(d).some((p) => samePerson(p, r.who)) && days(d).some((y) => near(y, r.day, 120)))
      .sort((a, b) => Math.abs(a.day - r.day) - Math.abs(b.day - r.day));
    const exact = cands.find((d) => sameMoney(owed(d), r.amount));
    if (exact) { assign(r, exact, 'by name + exact amount'); continue; }
    const parts = byDay.filter((x) => isInventory(x) && !x.deal && samePerson(x.who, r.who) && near(x.day, r.day, 7));
    const total = parts.reduce((a, x) => a + money(x.amount), 0);
    const split = parts.length > 1 && cands.find((d) => sameMoney(owed(d), total));
    if (split) { for (const x of parts) assign(x, split, `by name + exact amount (paid in ${parts.length} parts)`); continue; }
    const close = cands.find((d) => days(d).some((y) => near(y, r.day, 14)));
    if (close) assign(r, close, 'by name + date (check)');
    else r.how = 'NO MATCH: no purchase from this person within 14 days';
  }

  // 6. Money in that paid for no sale may be a refund on a purchase (Tony overpaid; the seller sent the difference
  //    back): the same person's purchase deal within 60 days that is over-paid by exactly that amount.
  const offNow = (d) => (sumOf(d.sales, 'collected') - sumOf(d.purchases, 'amount')) - (sumOf(d.inflows, 'amount') - sumOf(d.outflows, 'amount'));
  for (const r of inflows.filter((x) => !x.deal && /^NO MATCH/.test(x.how ?? ''))) {
    const d = withPurchases.filter((x) => people(x).some((p) => samePerson(p, r.who)) && days(x).some((y) => near(y, r.day, 60))
      && sameMoney(offNow(x), r.amount)).sort((a, b) => Math.abs(a.day - r.day) - Math.abs(b.day - r.day))[0];
    if (d) assign(r, d, 'refund of an overpayment on this purchase (name + exact amount)');
  }

  // Balances: (sales collected − purchases) − (money in − money out).
  for (const d of deals.values()) {
    const sum = (rows, f) => rows.reduce((a, r) => a + money(r[f]), 0);
    d.salesTotal = sum(d.sales, 'collected');
    d.purchaseTotal = sum(d.purchases, 'amount');
    d.inTotal = sum(d.inflows, 'amount');
    d.outTotal = sum(d.outflows, 'amount');
    d.invoiced ??= 0;                                         // grading/services invoices only
    d.off = Math.round(((d.salesTotal + d.invoiced - d.purchaseTotal) - (d.inTotal - d.outTotal)) * 100) / 100;
  }
  return deals;
}

/**
 * The four tables as plain rows (Excel row numbers kept, so the writer can check it's on the right row).
 * `file` defaults to the real workbook, read through workbook.js from a throwaway copy.
 */
export function readSheets(file) {
  const wb = readWorkbookSheets(['sales', 'purchases', 'inflows', 'outflows'], file);
  const rows = (name, map) => XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: null })
    .map((r) => ({ sheet: name, row: r.__rowNum__ + 1, ...map(r) }));
  return {
    sales: rows('sales', (r) => ({ id: r.inventoryID, day: toDay(r.saleDate), who: r.buyer, amount: r.saleAmount,
      collected: r.totalCollected ?? r.saleAmount, medium: r.transactionMedium, key: String(r.inventoryID ?? '') }))
      .filter((r) => r.id != null),
    purchases: rows('purchases', (r) => ({ id: r.inventoryID, day: toDay(r.purchaseDate), who: r.source,
      amount: r.purchaseAmount, medium: r.transMedium, transfer: r.Transfer === 'Y', key: String(r.inventoryID ?? '') }))
      .filter((r) => r.id != null),
    inflows: rows('inflows', (r) => ({ id: r.inventoryID, day: toDay(r.inflowDate), who: r.inflowCounterparty,
      amount: r.inflowAmount, category: r.inflowCategory, key: `${r.inflowCounterparty ?? ''}|${r.inflowAmount ?? ''}` })),
    outflows: rows('outflows', (r) => ({ day: toDay(r.outflowDate), who: r.outflowCounterparty, amount: r.outflowAmount,
      category: r.majorCategory, minor: r.minorCategory, comment: r.outflowComment,
      key: `${r.outflowCounterparty ?? ''}|${r.outflowAmount ?? ''}` })),
  };
}

function main() {
  const args = process.argv.slice(2);
  const i = args.indexOf('--workbook');
  const file = i >= 0 ? args[i + 1] : undefined;   // undefined = the real workbook (read-only)
  const samePath = path.join(ZOHO_DIR, 'same-people.json');
  if (fs.existsSync(samePath)) setSamePeople(JSON.parse(fs.readFileSync(samePath, 'utf8')));
  const linksPath = path.join(ZOHO_DIR, 'deal-links.json');
  if (fs.existsSync(linksPath)) setDealLinks(JSON.parse(fs.readFileSync(linksPath, 'utf8')));
  const sheets = readSheets(file);
  const details = JSON.parse(fs.readFileSync(path.join(ZOHO_DIR, 'details.json'), 'utf8'));
  const status = new Map([...JSON.parse(fs.readFileSync(path.join(ZOHO_DIR, 'invoices.json'), 'utf8')),
    ...JSON.parse(fs.readFileSync(path.join(ZOHO_DIR, 'quotes.json'), 'utf8'))].map((r) => [r.number, r.status]));
  const zohoDocs = Object.values(details).map((d) => ({ ...d, status: status.get(d.number) }));
  const deals = proposeDeals({ ...sheets, zohoDocs });

  const out = {
    made: new Date().toISOString(), workbook: file,
    rows: Object.fromEntries(['sales', 'purchases', 'inflows', 'outflows'].map((s) => [s,
      sheets[s].map((r) => ({ row: r.row, key: r.key, deal: r.deal ?? '', how: r.how ?? '' }))])),
    deals: [...deals.values()].map((d) => ({ id: d.id, linked: (d.linked ?? []).join(" "), type: d.type, invoiced: d.invoiced, source: d.source, who: d.who, date: d.day != null ? ymd(d.day) : '',
      sales: d.sales.length, purchases: d.purchases.length, inflows: d.inflows.length, outflows: d.outflows.length,
      salesTotal: d.salesTotal, purchaseTotal: d.purchaseTotal, inTotal: d.inTotal, outTotal: d.outTotal, off: d.off,
      unmatchedLines: d.unmatchedLines })),
  };
  fs.writeFileSync(path.join(ZOHO_DIR, 'deal-proposal.json'), JSON.stringify(out, null, 1));

  // Summary
  const count = (rows) => Object.entries(rows.reduce((a, r) => {
    const k = (r.how ?? '').replace(/(INV|PO)-\d+/g, '$1-…').replace(/#.*$/, '#…').replace(/D-\d+-\d+/g, 'D-…');
    a[k] = (a[k] ?? 0) + 1; return a;
  }, {})).sort((a, b) => b[1] - a[1]);
  for (const s of ['sales', 'purchases', 'inflows', 'outflows']) {
    console.log(`\n${s} (${sheets[s].length} rows):`);
    for (const [k, n] of count(sheets[s])) console.log(`  ${String(n).padStart(5)}  ${k || '(none)'}`);
  }
  const all = [...deals.values()];
  const z = all.filter((d) => d.source === 'Zoho');
  console.log(`\nDeals: ${all.length} (${z.length} Zoho, ${all.length - z.length} made up)`);
  console.log(`  balanced: ${all.filter((d) => d.off === 0).length}; off: ${all.filter((d) => d.off !== 0).length}`);
  console.log(`  Zoho records with coin lines not found in the workbook: ${z.filter((d) => d.unmatchedLines.length).length}`
    + ` (${z.reduce((a, d) => a + d.unmatchedLines.length, 0)} lines)`);
  console.log(`  Zoho records with no workbook rows at all: ${z.filter((d) => d.type === 'Coin' && !d.sales.length && !d.purchases.length).length}`);
  for (const t of ['Grading', 'Services']) console.log(`  ${t} invoices: ${all.filter((d) => d.type === t).map((d) => `${d.id} ${d.off === 0 ? 'paid' : 'off ' + d.off}`).join(', ') || 'none'}`);
  console.log(`\nSaved ${path.join(ZOHO_DIR, 'deal-proposal.json')}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
