/**
 * CDN (Greysheet) price snapshot for every graded coin in the workbook: the inventory sheet (active + sold) and the
 * old-LLC archive sheet. Asks CDN's Advanced pricing (CPG, Grey, Blue Book, PCGS/NGC columns) by PCGS number (or
 * Friedberg number) + grade, and saves one dated snapshot to the analytics folder so the same day's data can be
 * analysed again without paying for the calls twice.
 *
 *   node cdn-snapshot.js            run (asks CDN only for what today's cache doesn't have)
 *   node cdn-snapshot.js --active   weekly refresh: ask CDN only for ACTIVE coins (~110 calls)
 *   node cdn-snapshot.js --plan     show what would be asked, no calls
 *
 * Output (settings.analytics/CDN, NEVER in this repo — it holds prices and buyer names):
 *   cache-YYYY-MM-DD.json     CDN answers by request, so a re-run the same day costs nothing
 *   snapshot-YYYY-MM-DD.json  one record per workbook row: the row's own facts + what CDN said
 *   snapshot-YYYY-MM-DD.csv   the same, flat, for Excel
 *
 * The workbook is only read (from a throwaway copy), never written.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import XLSX from 'xlsx';
import { settings } from './settings.js';
import { readInventory, readWorkbookSheets, gradeOf, pcgsOf, companyOf } from './workbook.js';

const RECENT_DAYS = 61;   // a coin bought within this many days gets CDN Grey as its "when bought" baseline

const API = 'https://cpgpublicapiv2.greysheet.com/api/GetPricingRequest';
const OLD_SHEET = 'G10Solutions_purchases';
const PLAN_ONLY = process.argv.includes('--plan');
const ACTIVE_ONLY = process.argv.includes('--active');

const key = process.env.CDN_API_KEY;
const token = process.env.CDN_API_TOKEN;
if (!PLAN_ONLY && (!key || !token)) throw new Error('CDN_API_KEY / CDN_API_TOKEN missing from engine/.env');

const today = new Date().toLocaleDateString('en-CA');   // YYYY-MM-DD, local time
const outDir = path.join(settings.analytics, 'CDN');
fs.mkdirSync(outDir, { recursive: true });
const cacheFile = path.join(outDir, `cache-${today}.json`);
const cache = fs.existsSync(cacheFile) ? JSON.parse(fs.readFileSync(cacheFile, 'utf8')) : {};

// ---------------------------------------------------------------------------
// Rows -> items
// ---------------------------------------------------------------------------

const num = (v) => (typeof v === 'number' ? v : Number(String(v ?? '').replace(/[$,]/g, '')));
const money = (v) => (Number.isFinite(num(v)) && String(v ?? '') !== '' ? num(v) : null);
/** Excel serial or Date -> YYYY-MM-DD */
const day = (v) => {
  if (v instanceof Date) return v.toLocaleDateString('en-CA');
  if (typeof v === 'number' && v > 20000) return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10);
  return v ? String(v) : '';
};

const { rows: inv } = readInventory();
const oldBook = readWorkbookSheets([OLD_SHEET]);
const old = XLSX.utils.sheet_to_json(oldBook.Sheets[OLD_SHEET], { defval: null, raw: true });

const items = [
  ...inv.map((r) => ({
    source: 'inventory', id: String(r.inventoryID), status: r.Status, type: r.Type ?? '',
    description: String(r.itemDescription ?? ''), company: companyOf(r.Certification), cac: r.CAC, pcgsRaw: r['PCGS Num'],
    purchaseDate: day(r.purchaseDate), purchaseAmount: money(r.purchaseAmount), listPrice: money(r.listPrice),
    saleDate: day(r['Sell Date']), saleAmount: money(r['Sale Amount']), buyer: '', buyerMarket: '',
    greyAtPurchase: null,
  })),
  ...old.map((r) => ({
    source: OLD_SHEET, id: String(r.inventoryID), status: 'Sold', type: '',
    description: String(r.description ?? ''), company: (/\b(PCGS|NGC|CACG|ANACS|ICG)\b/.exec(r.description) || [])[1] || 'Ungraded',
    cac: null, pcgsRaw: null,
    purchaseDate: day(r.purchaseDate), purchaseAmount: money(r['Purchase Amount']), listPrice: money(r['List Price']),
    saleDate: day(r['Sale Date']), saleAmount: money(r['Final Sale']), buyer: r.Buyer ?? '', buyerMarket: r['Buyer Market'] ?? '',
    greyAtPurchase: null,
  })),
].filter((it) => !ACTIVE_ONLY || it.status === 'Active');

// Grey when bought: grey-at-purchase.json (built by grey-history.js from the archived workbooks). A coin bought in the
// last RECENT_DAYS with no baseline yet gets this run's CDN Grey as its baseline (after the CDN calls, below).
const intakeFile = path.join(outDir, 'grey-at-purchase.json');
const intake = fs.existsSync(intakeFile) ? JSON.parse(fs.readFileSync(intakeFile, 'utf8')) : {};
for (const it of items) if (intake[it.id]) it.greyAtPurchase = intake[it.id].grey;

for (const it of items) {
  it.grade = gradeOf(it.description, { cac: it.cac, company: it.company });
  it.gradeNumber = Number((/^[A-Za-z]{1,3}\s?(\d{1,2})/.exec(it.grade) || [])[1]) || null;
  it.isCac = /\bCAC\b/.test(it.grade);
  const { popNumber, catalogNumber } = pcgsOf(it.pcgsRaw, it.grade);
  it.pcgsNumber = catalogNumber;
  it.pcgsDesignationNumber = popNumber !== catalogNumber ? popNumber : null;
  it.frNumber = (/\bFr\.?\s*-?(\d+[A-Z]?)\b/i.exec(it.description) || [])[1] ?? null;
  it.plan = !it.gradeNumber ? 'no grade'
    : it.pcgsNumber ? 'by PCGS #'
    : it.frNumber ? 'by Fr #'
    : it.company === 'PCGS' ? 'needs PCGS cert lookup'
    : it.company === 'NGC' ? 'NGC, no number'
    : 'no number';
}

const tally = {};
for (const it of items) tally[`${it.source.padEnd(23)} ${it.plan}`] = (tally[`${it.source.padEnd(23)} ${it.plan}`] || 0) + 1;
console.log('What can be looked up:');
for (const k of Object.keys(tally).sort()) console.log(`  ${k.padEnd(48)} ${tally[k]}`);

// ---------------------------------------------------------------------------
// CDN calls (deduplicated, cached for the day)
// ---------------------------------------------------------------------------

/** The requests to try for an item, best first: the designation number (CAM/DMPL/PL are priced apart), then the catalog number. */
function requestsFor(it) {
  if (it.plan === 'by PCGS #') {
    const nums = [it.pcgsDesignationNumber, it.pcgsNumber].filter(Boolean);
    return nums.map((n) => `PcgsNumber=${n}&Grade=${it.gradeNumber}`);
  }
  if (it.plan === 'by Fr #') return [`FrNumber=${encodeURIComponent(it.frNumber)}&Grade=${it.gradeNumber}`];
  return [];
}

let calls = 0;
async function ask(q) {
  if (q in cache) return cache[q];
  calls++;
  const res = await fetch(`${API}?${q}&ApiLevel=Advanced`, { headers: { 'x-api-key': key, 'x-api-token': token, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`CDN ${res.status} for ${q}`);
  const b = await res.json();
  if (b.PermitAccess === false) throw new Error(`CDN refused: ${b.AccessDeniedMessage}`);
  cache[q] = { at: new Date().toISOString(), Data: b.Data ?? [] };
  if (calls % 25 === 0) fs.writeFileSync(cacheFile, JSON.stringify(cache));
  return cache[q];
}

const wanted = [...new Set(items.flatMap((it) => requestsFor(it).slice(0, 1)))];
const notCached = wanted.filter((q) => !(q in cache));
console.log(`\n${wanted.length} distinct coin+grade requests; ${notCached.length} not yet asked today.`);
if (PLAN_ONLY) process.exit(0);

// first-choice requests, 4 at a time
for (let i = 0; i < notCached.length; i += 4) {
  await Promise.all(notCached.slice(i, i + 4).map(ask));
  process.stdout.write(`\r  asked ${Math.min(i + 4, notCached.length)}/${notCached.length}`);
}
// fallbacks (catalog # when the designation # found nothing)
for (const it of items) {
  const qs = requestsFor(it);
  if (qs.length > 1 && !(cache[qs[0]]?.Data?.length)) await ask(qs[1]);
}
fs.writeFileSync(cacheFile, JSON.stringify(cache));
console.log(`\n${calls} CDN calls made this run.`);

// ---------------------------------------------------------------------------
// Snapshot
// ---------------------------------------------------------------------------

const val = (v) => (v === '' || v == null ? null : num(v));
const yearOf = (s) => (/\b(1[6-9]\d\d|20\d\d)\b/.exec(s) || [])[1] ?? null;

for (const it of items) {
  it.cdn = null;
  const q = requestsFor(it).find((r) => cache[r]?.Data?.length);
  if (!q) { it.match = it.plan.startsWith('by') ? 'CDN has no price' : it.plan; continue; }
  const d = cache[q].Data;
  const coin = d[0];
  const rows = (coin.PricingData ?? []).filter((p) => Number(p.Grade) === it.gradeNumber);
  const row = rows.find((p) => Boolean(p.IsCac) === it.isCac) ?? rows.find((p) => !p.IsCac) ?? null;
  const plain = rows.find((p) => !p.IsCac) ?? null;
  it.cdn = {
    query: q, gsid: coin.GsId, name: coin.Name, entries: d.length, gradeLabel: row?.GradeLabel ?? null, cacRow: Boolean(row?.IsCac),
    cpg: val(row?.CpgVal), grey: val(row?.GreyVal), blueBook: val(row?.BlueBookVal), pcgsCol: val(row?.PcgsVal), ngcCol: val(row?.NgcVal),
    // the non-CAC values too, for CAC coins (to see the CAC premium)
    cpgPlain: val(plain?.CpgVal), greyPlain: val(plain?.GreyVal),
  };
  const y1 = yearOf(it.description); const y2 = yearOf(coin.Name);
  it.match = !row ? 'no price at this grade'
    : d.length > 1 ? 'check: CDN gave several coins'
    : y1 && y2 && y1 !== y2 ? 'check: year differs'
    : 'matched';
}

// intake baselines for recent purchases (see grey-history.js)
const cutoff = new Date(Date.now() - RECENT_DAYS * 86400000).toLocaleDateString('en-CA');
let baselines = 0;
for (const it of items) {
  if (it.status !== 'Active' || intake[it.id] || !(it.purchaseDate >= cutoff) || it.cdn?.grey == null || it.match !== 'matched') continue;
  intake[it.id] = { grey: it.cdn.grey, recordedBy: today, from: 'CDN API (intake)', purchaseDate: it.purchaseDate, description: it.description, history: [{ asOf: today, grey: it.cdn.grey }] };
  it.greyAtPurchase = it.cdn.grey;
  baselines++;
}
if (baselines) { fs.writeFileSync(intakeFile, JSON.stringify(intake, null, 1)); console.log(`${baselines} new coin(s) got today's Grey as their baseline.`); }

const snapshot = { takenAt: new Date().toISOString(), scope: ACTIVE_ONLY ? 'active' : 'all', source: 'CDN Public API v2, ApiLevel=Advanced', note: 'Grey / Blue Book are CDN wholesale values: internal use only.', items };
const stem = `snapshot-${today}${ACTIVE_ONLY ? '-active' : ''}`;
fs.writeFileSync(path.join(outDir, `${stem}.json`), JSON.stringify(snapshot, null, 1));

const cols = ['source', 'id', 'status', 'type', 'description', 'grade', 'company', 'pcgsNumber', 'plan', 'match',
  'purchaseDate', 'purchaseAmount', 'greyAtPurchase', 'listPrice', 'saleDate', 'saleAmount', 'buyer', 'buyerMarket',
  'cdn.gsid', 'cdn.name', 'cdn.gradeLabel', 'cdn.cacRow', 'cdn.cpg', 'cdn.grey', 'cdn.blueBook', 'cdn.pcgsCol', 'cdn.ngcCol', 'cdn.cpgPlain', 'cdn.greyPlain'];
const get = (o, c) => c.split('.').reduce((a, k) => a?.[k], o);
const csvCell = (v) => (v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
const csv = [cols.join(','), ...items.map((it) => cols.map((c) => csvCell(get(it, c))).join(','))].join('\r\n');
fs.writeFileSync(path.join(outDir, `${stem}.csv`), '﻿' + csv);

const m = {};
for (const it of items) m[`${it.source.padEnd(23)} ${it.match}`] = (m[`${it.source.padEnd(23)} ${it.match}`] || 0) + 1;
console.log('\nResults:');
for (const k of Object.keys(m).sort()) console.log(`  ${k.padEnd(52)} ${m[k]}`);
console.log(`\nSaved to ${outDir}`);
