/**
 * Rebuilds <analytics>/CDN/grey-at-purchase.json: the Grey value closest to each coin's purchase.
 *
 * Tony kept the workbook's "Greysheet Bid" column up to date over time (retired 2026-11), so the LAST value is not the
 * value at purchase. Each archived workbook in "G10 Holdings LLC/Backups" is a dated look at that column; the EARLIEST
 * non-zero value found for a coin is its baseline, and every value seen is kept as its history.
 *
 * Coins bought in the last RECENT_DAYS with no archived value get the CDN API Grey from the newest snapshot as their
 * baseline (cdn-snapshot.js does the same for new coins from now on).
 *
 *   node grey-history.js           rebuild
 *   node grey-history.js --plan    show what it would do, write nothing
 *
 * Backups are read from throwaway copies (workbook.js), never written.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import XLSX from 'xlsx';
import { settings } from './settings.js';
import { readWorkbookSheets, readInventory } from './workbook.js';

export const RECENT_DAYS = 61;   // "the past two months" (same as cdn-snapshot.js)
const PLAN_ONLY = process.argv.includes('--plan');
const backupDir = settings.backups;
const cdnDir = path.join(settings.analytics, 'CDN');
const outFile = path.join(cdnDir, 'grey-at-purchase.json');

const num = (v) => (typeof v === 'number' ? v : Number(String(v ?? '').replace(/[$,]/g, '')));
const day = (v) => (v instanceof Date ? v.toLocaleDateString('en-CA') : typeof v === 'number' && v > 20000
  ? new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10) : String(v ?? ''));

// 1. every backup's Greysheet values, dated by the file's save time
const seen = new Map();   // id -> [{asOf, grey, file}]
const backups = fs.readdirSync(backupDir).filter((f) => /\.xlsx$/i.test(f) && !f.startsWith('~$'));
for (const f of backups) {
  const file = path.join(backupDir, f);
  const book = readWorkbookSheets(['inventory'], file);
  const ws = book.Sheets.inventory;
  if (!ws) continue;
  const rows = XLSX.utils.sheet_to_json(ws, { defval: null, raw: true });
  const col = Object.keys(rows[0] ?? {}).find((k) => /greysheet/i.test(k));
  if (!col) continue;
  const asOf = fs.statSync(file).mtime.toLocaleDateString('en-CA');
  for (const r of rows) {
    const g = num(r[col]);
    if (!(g > 0) || r.inventoryID == null) continue;
    const id = String(r.inventoryID);
    if (!seen.has(id)) seen.set(id, []);
    seen.get(id).push({ asOf, grey: g, file: f, purchaseDate: day(r.purchaseDate), description: r.itemDescription });
  }
}

// 2. baseline = earliest value; history = the distinct values in date order
const out = {};
for (const [id, list] of seen) {
  list.sort((a, b) => a.asOf.localeCompare(b.asOf));
  const history = [];
  for (const h of list) if (!history.length || history.at(-1).grey !== h.grey) history.push({ asOf: h.asOf, grey: h.grey });
  const first = list[0];
  out[id] = { grey: first.grey, recordedBy: first.asOf, from: `workbook backup ${first.file}`, purchaseDate: first.purchaseDate, description: first.description, history };
}

// 3. recent purchases with no archived value: CDN Grey from the newest full snapshot
const snaps = fs.readdirSync(cdnDir).filter((f) => /^snapshot-\d{4}-\d{2}-\d{2}(-active)?\.json$/.test(f)).sort();
const snap = JSON.parse(fs.readFileSync(path.join(cdnDir, snaps.at(-1)), 'utf8'));
const snapDay = snap.takenAt.slice(0, 10);
const cutoff = new Date(Date.now() - RECENT_DAYS * 86400000).toLocaleDateString('en-CA');
let fromApi = 0;
const recentNoValue = [];
for (const it of snap.items) {
  if (it.status !== 'Active' || out[it.id] || !(it.purchaseDate >= cutoff)) continue;
  if (it.cdn?.grey != null) {
    out[it.id] = { grey: it.cdn.grey, recordedBy: snapDay, from: `CDN API (${snap.file ?? snaps.at(-1)})`, purchaseDate: it.purchaseDate, description: it.description, history: [{ asOf: snapDay, grey: it.cdn.grey }] };
    fromApi++;
  } else recentNoValue.push(it);
}

// report
const { rows: inv } = readInventory();
const act = inv.filter((r) => r.Status === 'Active');
const has = act.filter((r) => out[String(r.inventoryID)]);
const changedOverTime = Object.values(out).filter((o) => o.history.length > 1).length;
console.log(`${backups.length} backups read. ${seen.size} coins have a Greysheet value in at least one backup; ${changedOverTime} changed over time.`);
console.log(`${fromApi} recent purchases (since ${cutoff}) got today's CDN Grey as their baseline.`);
console.log(`Active coins with a baseline: ${has.length} of ${act.length}.`);
if (recentNoValue.length) console.log(`Recent purchases CDN couldn't price (no baseline): ${recentNoValue.length}`);
if (!PLAN_ONLY) { fs.writeFileSync(outFile, JSON.stringify(out, null, 1)); console.log(`Saved ${outFile}`); }
