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
 *      A trade written as an invoice + a PO is one deal under the invoice # (tradePairs).
 *   2. A row NOT on a Zoho record never takes its number, even with the same person on the same day; it is flagged.
 *   3. Everything else (paper slips at shows, pre-Zoho deals): D-YYMMDD-NN, one per person per day, sales and
 *      purchases together (that's a trade).
 *   Money in (inflows) follows the coin in its inventoryID; otherwise person + date. Money out (outflows, "Inventory")
 *   matches a deal with purchases by person + date, preferring the exact amount owed.
 *   eBay: buyers pay eBay, which pays Tony in lumps, so an eBay deal is one payout + the eBay-paid sales it covers
 *   (EB-YYMMDD). A charge paid TO eBay can cover purchases from several eBay sellers. Layaway payments made before a
 *   sale is booked join it when they add up to it.
 * Purchases marked Transfer = Y (moved in from G10 Solutions), coins given as a Capital Distribution, and non-inventory
 * money rows get no deal.
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
const isEbay = (s) => /\bebay\b/i.test(s ?? '');
const cents = (v) => Math.round(money(v) * 100);
// Purchases paid with foreign cash Tony had on hand (transMedium "FX Cash", logged on the FX tab, not in outflows).
const fxPaid = (d) => d.purchases.filter((r) => /^fx\b/i.test(r.medium ?? '')).reduce((a, r) => a + money(r.amount), 0);
const STORE_FEE = 2195;                                       // eBay store subscription, in cents, sometimes netted

/**
 * The rows (sales: by `collected`) that add up to exactly `target` cents: the fewest rows, then the oldest. Only the
 * 18 newest candidates are tried (2^18 combinations at most).
 */
export function subsetSum(rows, target) {
  const c = [...rows].sort((a, b) => a.day - b.day || a.row - b.row).slice(-18);
  let best = null;
  for (let mask = 1; mask < 1 << c.length; mask++) {
    let t = 0, n = 0, age = 0;
    for (let j = 0; j < c.length; j++) if (mask & (1 << j)) { t += cents(c[j].collected ?? c[j].amount); n++; age += c[j].day; }
    if (t !== target) continue;
    if (!best || n < best.n || (n === best.n && age < best.age)) best = { mask, n, age };
  }
  return best && c.filter((_, j) => best.mask & (1 << j));
}

/**
 * Trade pairs: an invoice (coins Tony sold) and a PO (coins he took in) that are ONE trade. Tony's practice: the
 * trade-in rows carry the INVOICE number, so a PO whose coins sit on rows tagged with an invoice # is that invoice's
 * other half (and the same the other way round). Pairs the workbook can't show (no certs on the PO) go in
 * .zoho/deal-links.json as [["INV-000123", "PO-000045"], …]. Returns [{ inv, po, from: 'workbook' | 'links', coins }].
 * Used to join the two records into one deal, and later for deal analysis (profit on the sale AND on the trade-ins).
 */
export function tradePairs({ sales, purchases, zohoDocs }) {
  const live = new Map(zohoDocs.filter((z) => !/^(void|declined)$/i.test(z.status ?? '')).map((z) => [z.number, z]));
  const found = new Map();
  const add = (inv, po, from, n = 0) => {
    const k = `${inv}|${po}`;
    const p = found.get(k) ?? { inv, po, from, coins: 0 };
    p.coins += n;
    found.set(k, p);
  };
  for (const doc of live.values()) {
    const otherKind = doc.kind === 'invoice' ? /^PO-/ : /^INV-/;
    // Each coin in the sheet its line says (invoice plus line / PO minus line = sold; the rest = taken in), so a coin
    // that passed through the same person twice (sold to them, bought back) doesn't make two separate deals a pair.
    const certs = new Map();
    for (const li of doc.line_items) {
      const plus = (Number(li.price ?? li.rate ?? li.item_total) || 0) >= 0;
      const sheet = (doc.kind === 'invoice') === plus ? 'sales' : 'purchases';
      for (const c of certsIn(`${li.description ?? ''} ${li.name ?? ''}`)) certs.set(baseId(c), sheet);
    }
    const counts = new Map();
    for (const r of [...sales, ...purchases]) {
      if (!r.fixed || !otherKind.test(r.fixed) || !live.has(r.fixed) || certs.get(baseId(r.id)) !== r.sheet) continue;
      if (!near(r.day, toDay(doc.date), 60) || !samePerson(r.who, doc.customer_name)) continue;
      counts.set(r.fixed, (counts.get(r.fixed) ?? 0) + 1);
    }
    for (const [other, n] of counts) doc.kind === 'invoice' ? add(doc.number, other, 'workbook', n) : add(other, doc.number, 'workbook', n);
  }
  for (const g of DEAL_LINKS) for (const n of g.slice(1)) if (!found.has(`${g[0]}|${n}`)) add(g[0], n, 'links');
  return [...found.values()].sort((a, b) => a.inv.localeCompare(b.inv));
}

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

  // 1. Zoho invoices → sales, Zoho quotes (POs) → purchases, coin by coin. Void invoices and declined POs don't count.
  //    A negative line is the other side of a trade: on a PO, a coin Tony gave (a sale); on an invoice, a coin he took
  //    in (a purchase). Looking in the wrong sheet once tied a coin to whoever had sold it to Tony weeks earlier.
  //    A coin often appears on SEVERAL records (Tony takes it in on one, sells it on the next), so cert matches are
  //    settled across all records at once, best first: the record's own person before anyone else, then the nearest
  //    date. Another person's record only counts within 3 days (a sale invoiced under a spouse's name); otherwise a
  //    later resale could take an older record's number. A record written the wrong way round (coins Tony BOUGHT as
  //    plus lines) still finds its coins in the other sheet, but only for that record's own person, within 3 days.
  const live = [...zohoDocs].filter((doc) => !/^(void|declined)$/i.test(doc.status ?? ''))
    .sort((a, b) => toDay(a.date) - toDay(b.date));
  const lineInfo = [];
  for (const doc of live) {
    const d = newDeal(doc.number, 'Zoho', doc.customer_name, toDay(doc.date));
    const pool = doc.kind === 'invoice' ? sales : purchases;
    for (const li of doc.line_items) {
      const price = Number(li.price ?? li.rate ?? li.item_total) || 0;
      const lpool = price >= 0 ? pool : (doc.kind === 'invoice' ? purchases : sales);
      const other = lpool === sales ? purchases : sales;
      lineInfo.push({ doc, d, li, price, lpool, other, certs: certsIn(`${li.description ?? ''} ${li.name ?? ''}`).map(baseId), hit: null });
    }
  }
  const pairs = [];
  for (const L of lineInfo) {
    for (const cert of L.certs) {
      const own = (r) => samePerson(r.who, L.doc.customer_name);
      for (const r of L.lpool) {
        if (baseId(r.id) !== cert) continue;
        const gap = Math.abs(r.day - L.d.day);
        if (own(r) ? gap <= 60 : gap <= 3) pairs.push({ L, r, score: (own(r) ? 0 : 1000) + gap });
      }
      for (const r of L.other) {
        if (baseId(r.id) === cert && own(r) && Math.abs(r.day - L.d.day) <= 3) pairs.push({ L, r, score: 2000 + Math.abs(r.day - L.d.day) });
      }
    }
  }
  for (const { L, r } of pairs.sort((a, b) => a.score - b.score || a.L.d.day - b.L.d.day)) {
    if (L.hit || r.deal) continue;
    L.hit = r;
    assign(r, L.d, `Zoho ${L.doc.number}: cert #`);
  }
  for (const L of lineInfo) {
    if (L.hit) continue;
    const hit = L.lpool.filter((r) => !r.deal && samePerson(r.who, L.doc.customer_name) && near(r.day, L.d.day, 21)
      && sameMoney(r.amount, Math.abs(L.price))).sort((a, b) => Math.abs(a.day - L.d.day) - Math.abs(b.day - L.d.day))[0];
    if (hit) assign(hit, L.d, `Zoho ${L.doc.number}: name + amount`);
    else L.d.unmatchedLines.push(`${L.li.name ?? ''} ${L.li.description ?? ''}`.trim());
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

  // 1c. A big trade gets TWO Zoho records: an invoice for the coins Tony sold and a PO for the coins he took in. That's
  //     one deal and keeps the invoice number. Only KNOWN pairs are joined (tradePairs: from the workbook, where the
  //     trade-in rows carry the invoice #, plus .zoho/deal-links.json). Guessing pairs by person + date once joined a
  //     separate buyback PO to an older trade invoice.
  const linkedTo = new Map();
  for (const p of tradePairs({ sales, purchases, zohoDocs })) if (!linkedTo.has(p.po)) linkedTo.set(p.po, p.inv);
  for (const po of [...deals.values()].filter((d) => d.source === 'Zoho' && linkedTo.has(d.id))) {
    const inv = deals.get(linkedTo.get(po.id));
    if (!inv || inv === po) continue;
    for (const s of ['sales', 'purchases', 'inflows', 'outflows']) {
      for (const r of po[s]) { r.deal = inv.id; r.how = `${r.how} (trade: ${po.id} is part of ${inv.id})`; inv[s].push(r); }
    }
    inv.unmatchedLines.push(...po.unmatchedLines.map((l) => `${po.id}: ${l}`));
    inv.linked = [...(inv.linked ?? []), po.id];
    deals.delete(po.id);
  }

  // 1d. eBay. Buyers pay eBay, and eBay pays Tony later in lumps ("eBay" inflows) that cover whatever sold in between,
  //     sometimes with a few dollars shifted from one payout to the next. So for eBay the deal is the PAYOUT: each
  //     payout (or 2–3 consecutive ones) + the eBay-paid sales it adds up to, to the cent. A payout can also be short by
  //     the $21.95 store fee eBay sometimes nets out. Sales with no payout yet stay with their buyer (step 3).
  const payouts = inflows.filter((r) => isEbay(r.who) && /sale of inventory/i.test(r.category ?? '') && r.day != null)
    .sort((a, b) => a.day - b.day || a.row - b.row);
  const ebaySales = sales.filter((r) => !r.deal && isEbay(r.medium) && r.day != null);
  const perPayDay = new Map();
  for (let i = 0; i < payouts.length;) {
    let k = 1, hit = null;
    for (; k <= 3 && i + k <= payouts.length && !hit; k++) {
      const group = payouts.slice(i, i + k);
      const total = cents(sumOf(group, 'amount'));
      const last = group[k - 1].day;
      const cands = ebaySales.filter((r) => !r.deal && r.day <= last && r.day >= group[0].day - 30);
      hit = subsetSum(cands, total) ?? subsetSum(cands, total + STORE_FEE);
      if (hit) {
        const n = (perPayDay.get(last) ?? 0) + 1;
        perPayDay.set(last, n);
        const d = newDeal(`EB-${ymd(last).slice(2).replace(/-/g, '')}${n > 1 ? `-${n}` : ''}`, 'eBay payout', 'eBay', last);
        const fee = cents(sumOf(hit, 'collected')) - total;
        for (const r of hit) assign(r, d, `eBay sale, paid out in ${d.id}`);
        for (const r of group) assign(r, d, `eBay payout for ${hit.length} sale${hit.length > 1 ? 's' : ''}${fee ? ' (store fee $21.95 netted)' : ''}`);
      }
    }
    i += hit ? k - 1 : 1;
  }

  // 2. A row that is NOT on a Zoho record never gets that record's number, even with the same person on the same day
  //    (that put Zoho numbers on separate deals). It gets its own made-up number below, with a note to check whether
  //    it really belongs to the Zoho deal next to it.
  const zohoDeals = [...deals.values()].filter((d) => d.type === 'Coin');
  for (const r of [...sales, ...purchases].filter((x) => !x.deal && !x.transfer)) {
    const win = isTrade(r.medium) ? 3 : 0;
    const d = zohoDeals.filter((z) => people(z).some((p) => samePerson(p, r.who)) && days(z).some((x) => near(x, r.day, win)))
      .sort((a, b) => Math.abs(a.day - r.day) - Math.abs(b.day - r.day))[0];
    if (d) r.near = d.id;
  }

  // 3. The rest: one made-up deal per person per day (a sale and a purchase together = a trade).
  const groups = new Map();
  const dayKeys = new Map();
  for (const r of [...sales, ...purchases]) {
    if (r.deal) continue;
    if (r.transfer) { r.how = 'transfer from G10 Solutions (not a deal)'; continue; }
    // A coin Tony gave away as an owner distribution (in the ownerTransLog; no money moved): not a deal.
    if (/capital distribution/i.test(r.medium ?? '')) { r.how = 'capital distribution (not a deal)'; continue; }
    // Same day + same person, however the name was typed (a shop's name on the purchase, the owner's name on the sale = a trade).
    const sameDay = dayKeys.get(r.day) ?? [];
    const key = r.day != null && personKey(r.who)
      ? sameDay.find((k) => groups.get(k).some((x) => samePerson(x.who, r.who))) ?? `${r.day}|${personKey(r.who)}`
      : `row|${r.sheet}|${r.row}`;
    if (!groups.has(key)) { groups.set(key, []); if (r.day != null) dayKeys.set(r.day, [...sameDay, key]); }
    groups.get(key).push(r);
  }
  const perDay = new Map();
  for (const rows of [...groups.values()].sort((a, b) => (a[0].day ?? 0) - (b[0].day ?? 0) || a[0].row - b[0].row)) {
    const day = rows[0].day;
    const n = (perDay.get(day) ?? 0) + 1;
    perDay.set(day, n);
    const id = `D-${day != null ? ymd(day).slice(2).replace(/-/g, '') : 'NODATE'}-${String(n).padStart(2, '0')}`;
    const d = newDeal(id, 'made up', rows[0].who, day);
    for (const r of rows) {
      assign(r, d, rows.some((x) => x.sheet !== r.sheet) ? 'made-up deal (trade: sale + purchase same day)' : 'made-up deal (no Zoho record)');
      if (r.near) r.how += `; not on ${r.near} but same person & day: check`;
    }
  }

  // 4. Money in: the coin it names → that coin's deal; otherwise person + date.
  const saleById = new Map();                                // id → every sale with it (house numbers get reused)
  for (const s of sales) saleById.set(normId(s.id), [...(saleById.get(normId(s.id)) ?? []), s]);
  const withSales = [...deals.values()].filter((d) => d.sales.length);
  for (const r of inflows) {
    if (r.deal) continue;                                    // an eBay payout, placed in 1d
    if (/reimbursement|services rendered/i.test(r.category ?? '')) {
      // Paying a grading/services invoice: same person, exact amount, within 45 days after it (or a few days before).
      const d = nonCoin.filter((x) => !x.inflows.length && samePerson(x.who, r.who) && sameMoney(x.invoiced, r.amount)
        && r.day != null && r.day >= x.day - 3 && r.day <= x.day + 45).sort((a, b) => Math.abs(a.day - r.day) - Math.abs(b.day - r.day))[0];
      if (d) { assign(r, d, `pays ${d.id} (${d.type}): name + amount`); continue; }
      r.how = `not a deal (${r.category}; no Zoho invoice)`;
      continue;
    }
    if (!/sale of inventory/i.test(r.category ?? '')) { r.how = `not a deal (${r.category ?? 'no category'})`; continue; }
    // The inventoryID field may hold a deal number (Tony's practice from 2026-11-17 on), or one or more coin IDs ("107,
    // 108"). A coin ID only counts when that coin was sold within 120 days of the payment: small house numbers (109,
    // 110…) get reused, and a payment once jumped six months to a later coin with the same number.
    const ref = String(r.id ?? '').trim().toUpperCase();
    if (deals.has(ref)) { assign(r, deals.get(ref), 'deal # written on the row'); continue; }
    const coin = [ref, ...(/[,;&]/.test(ref) ? ref.split(/\s*[,;&]\s*/) : [])].filter(Boolean).map((id) => {
      const exact = (saleById.get(normId(id)) ?? []).filter((s) => near(s.day, r.day, 120))
        .sort((a, b) => Math.abs(a.day - r.day) - Math.abs(b.day - r.day))[0];
      return exact ?? sales.find((s) => baseId(s.id) === baseId(id) && near(s.day, r.day, 60));
    }).find((c) => c?.deal);
    if (coin) { assign(r, deals.get(coin.deal), `via coin #${coin.id}`); continue; }
    // Someone else paying a customer's bill (a third party's check): the comment says "… for <customer>".
    const forWho = /\bfor\s+([^,;()]+?)\s*$/i.exec(String(r.comment ?? ''))?.[1];
    const onBehalf = forWho && withSales.filter((x) => people(x).some((p) => samePerson(p, forWho)) && days(x).some((y) => near(y, r.day, 14)))
      .sort((a, b) => Math.abs(a.day - r.day) - Math.abs(b.day - r.day))[0];
    if (onBehalf) { assign(r, onBehalf, `paid on behalf of ${forWho} (comment) + date`); continue; }
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
    - d.outflows.reduce((a, r) => a + money(r.amount), 0) - fxPaid(d);
  const isInventory = (r) => /^inventory$/i.test(r.category ?? '');
  const byDay = [...outflows].sort((a, b) => (a.day ?? 0) - (b.day ?? 0));
  for (const r of byDay) {
    // Money a customer took back by theft during a deal (Bus Expense / Theft/Loss to that person): part of that day's deal.
    const theftOf = /theft|loss/i.test(r.minor ?? '') && [...deals.values()].find((d) => d.day === r.day && people(d).some((p) => samePerson(p, r.who)));
    if (theftOf) { assign(r, theftOf, 'taken back by the customer (Theft/Loss) in that day\'s deal'); continue; }
    if (!isInventory(r)) { r.how = `not a deal (${r.category ?? 'no category'}${r.minor ? ` / ${r.minor}` : ''})`; continue; }
    if (r.deal) continue;                                    // already placed as part of a split payment
    if (isEbay(r.who)) {
      // Paying eBay: one charge can cover coins bought from several eBay sellers (recorded under the seller's name, or
      // as "eBay"), up to 14 days apart. Those purchases + the payment become one deal.
      const open = withPurchases.filter((d) => d.type === 'Coin' && !d.sales.length && !d.outflows.length && days(d).some((y) => near(y, r.day, 14)));
      const rows = open.flatMap((d) => d.purchases);
      const hit = subsetSum(rows, cents(r.amount));
      if (hit) {
        const target = deals.get(hit[0].deal);
        for (const p of hit.filter((x) => x.deal !== target.id)) {
          const from = deals.get(p.deal);
          from.purchases = from.purchases.filter((x) => x !== p);
          if (!from.purchases.length && !from.sales.length) { deals.delete(from.id); withPurchases.splice(withPurchases.indexOf(from), 1); }
          assign(p, target, `${p.how} (bought on eBay, paid together with ${target.id})`);
        }
        assign(r, target, `paid to eBay for ${hit.length} purchase${hit.length > 1 ? 's' : ''} (exact amount)`);
        continue;
      }
    }
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
  const offNow = (d) => (sumOf(d.sales, 'collected') - sumOf(d.purchases, 'amount')) - (sumOf(d.inflows, 'amount') - sumOf(d.outflows, 'amount') - fxPaid(d));
  for (const r of inflows.filter((x) => !x.deal && /^NO MATCH/.test(x.how ?? ''))) {
    const d = withPurchases.filter((x) => people(x).some((p) => samePerson(p, r.who)) && days(x).some((y) => near(y, r.day, 60))
      && sameMoney(offNow(x), r.amount)).sort((a, b) => Math.abs(a.day - r.day) - Math.abs(b.day - r.day))[0];
    if (d) assign(r, d, 'refund of an overpayment on this purchase (name + exact amount)');
  }

  // 7. Layaway: the buyer pays in parts, often BEFORE the sale is booked (the coin goes home when it's paid off). A sale
  //    still short gets the same person's loose payments from up to 120 days before it (or 14 after) that add up to
  //    exactly the shortfall: unmatched ones, or ones step 4 guessed by date into a deal they over-pay.
  for (const d of [...deals.values()].filter((x) => x.type === 'Coin' && x.sales.length).sort((a, b) => a.day - b.day)) {
    const short = cents(offNow(d));
    if (short <= 0) continue;
    const loose = inflows.filter((r) => r.id == null && /sale of inventory/i.test(r.category ?? '')
      && people(d).some((p) => samePerson(p, r.who)) && r.day != null && r.day >= d.day - 120 && r.day <= d.day + 14
      && (!r.deal || (/by name \+ date/.test(r.how ?? '') && r.deal !== d.id
        && cents(offNow(deals.get(r.deal))) <= -cents(r.amount))));      // taking it leaves that deal at least even
    const hit = subsetSum(loose, short);
    if (!hit) continue;
    for (const r of hit) {
      if (r.deal) { const from = deals.get(r.deal); from.inflows = from.inflows.filter((x) => x !== r); }
      assign(r, d, 'layaway payment (name + payments add up to the sale)');
    }
  }

  // Balances: (sales collected − purchases) − (money in − money out).
  for (const d of deals.values()) {
    const sum = (rows, f) => rows.reduce((a, r) => a + money(r[f]), 0);
    d.salesTotal = sum(d.sales, 'collected');
    d.purchaseTotal = sum(d.purchases, 'amount');
    d.inTotal = sum(d.inflows, 'amount');
    d.outTotal = sum(d.outflows, 'amount') + fxPaid(d);        // + foreign cash paid out (FX tab)
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
  // dealID = the deal # already in the workbook (since 2026-11-17), kept as `fixed`; the matcher's own guess is `deal`.
  const rows = (name, map) => XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: null })
    .map((r) => ({ sheet: name, row: r.__rowNum__ + 1, fixed: String(r.dealID ?? '').trim().toUpperCase(), ...map(r) }));
  return {
    sales: rows('sales', (r) => ({ id: r.inventoryID, day: toDay(r.saleDate), who: r.buyer, amount: r.saleAmount,
      collected: r.totalCollected ?? r.saleAmount, medium: r.transactionMedium, key: String(r.inventoryID ?? '') }))
      .filter((r) => r.id != null),
    purchases: rows('purchases', (r) => ({ id: r.inventoryID, day: toDay(r.purchaseDate), who: r.source,
      amount: r.purchaseAmount, medium: r.transMedium, transfer: r.Transfer === 'Y', key: String(r.inventoryID ?? '') }))
      .filter((r) => r.id != null),
    inflows: rows('inflows', (r) => ({ id: r.inventoryID, day: toDay(r.inflowDate), who: r.inflowCounterparty,
      amount: r.inflowAmount, category: r.inflowCategory, comment: r.inflowComment, key: `${r.inflowCounterparty ?? ''}|${r.inflowAmount ?? ''}` })),
    outflows: rows('outflows', (r) => ({ day: toDay(r.outflowDate), who: r.outflowCounterparty, amount: r.outflowAmount,
      category: r.majorCategory, minor: r.minorCategory, comment: r.outflowComment,
      key: `${r.outflowCounterparty ?? ''}|${r.outflowAmount ?? ''}` })),
  };
}

/** The workbook's four tables plus the saved Zoho records, with the same-people and links lists loaded. */
export function loadInputs(file) {
  const samePath = path.join(ZOHO_DIR, 'same-people.json');
  if (fs.existsSync(samePath)) setSamePeople(JSON.parse(fs.readFileSync(samePath, 'utf8')));
  const linksPath = path.join(ZOHO_DIR, 'deal-links.json');
  if (fs.existsSync(linksPath)) setDealLinks(JSON.parse(fs.readFileSync(linksPath, 'utf8')));
  const sheets = readSheets(file);
  const details = JSON.parse(fs.readFileSync(path.join(ZOHO_DIR, 'details.json'), 'utf8'));
  const status = new Map([...JSON.parse(fs.readFileSync(path.join(ZOHO_DIR, 'invoices.json'), 'utf8')),
    ...JSON.parse(fs.readFileSync(path.join(ZOHO_DIR, 'quotes.json'), 'utf8'))].map((r) => [r.number, r.status]));
  const zohoDocs = Object.values(details).map((d) => ({ ...d, status: status.get(d.number) }));
  return { sheets, zohoDocs };
}

function main() {
  const args = process.argv.slice(2);
  const i = args.indexOf('--workbook');
  const file = i >= 0 ? args[i + 1] : undefined;   // undefined = the real workbook (read-only)
  const { sheets, zohoDocs } = loadInputs(file);
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
