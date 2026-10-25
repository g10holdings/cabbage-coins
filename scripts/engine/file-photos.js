/**
 * Files away each coin's photo folder once the coin moves on (Tony's choice, 2026-10-18):
 *
 *   published  waiting_website -> doneUnsold   the camera shots (originals\) are DELETED; the 4 website photos move
 *   sold       doneUnsold -> doneSOLD          (or straight from waiting_website, raws deleted, if it sold fast)
 *
 * "Sold" = Sold in the WORKBOOK, or the website's Sold box (sold.js). Folders are matched by the cert # at the end
 * of the folder name. Older doneUnsold folders have no cert ("1881S_1_P66CAC", "1894-Morgan-Silver-Dollar-PCGS-
 * VF30-CAC"), so those are matched to workbook rows by year + mint + grade number, then denomination and shared
 * words; a folder that could be more than one coin, some sold and some not, is left alone and named on screen.
 *
 * A published coin's folder is only filed when its 4 photos are there and the listing has its photos. Anything else
 * in a folder (not the 4 photos, not the camera shots) is moved along with it and named, so nothing unknown is
 * deleted. Drafts are never touched. Paths come from settings.json (photos.inProgress / listed / sold).
 *
 *   node file-photos.js          preview: what would move and what would be deleted
 *   node file-photos.js --ask    preview, then ask (4_After-Publishing-or-Selling)
 *   node file-photos.js --apply  do it without asking
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { photoFolders, splitCert } from './listing-photos.js';
import { readInventory, certKey, nameKey, hasCert, denominationOf } from './workbook.js';
import { workbookSales, STAND_INS } from './sold.js';
import { settings, sanity } from './settings.js';
import { askYes } from './ask.js';

const args = process.argv.slice(2);
const ASK = args.includes('--ask');
let APPLY = args.includes('--apply');
const { inProgress, listed, sold } = settings.photos;

const mb = (bytes) => `${(bytes / 1048576).toFixed(0)} MB`;
const sizeOf = (p) => (fs.statSync(p).isDirectory() ? fs.readdirSync(p).reduce((t, f) => t + sizeOf(path.join(p, f)), 0) : fs.statSync(p).size);

// ---------------------------------------------------------------------------
// Matching a folder with no cert # to a coin
// ---------------------------------------------------------------------------

/**
 * Year + mint + grade number, written the same for a folder name and a workbook description:
 * "1881S_1_P66CAC", "1881-S-Morgan-...-MS66" and "1881-S $1 Morgan Silver Dollar PCGS MS66 CAC" all give "1881S-66".
 */
export function coinKey(text) {
  const t = String(text ?? '').replace(/_\d{1,2}$/, '');   // "..._2": a second folder of the same kind
  const y = /(?<!\d)(1[5-9]\d\d|20\d\d)(?!\d)/.exec(t);
  if (!y) return null;
  const after = t.slice(y.index + 4);
  // Capitals only, and not the start of a word: "1881O-", "2020WPalladium" and "1881-S $1" have one; "1830-Capped" doesn't.
  const mint = /^[- ]?(CC|PTS|[OSDWPC])(?![a-z])/.exec(after)?.[1] ?? '';
  const grade = /(?<![A-Za-z])(?:MS|PR|PF|SP|AU|XF|EF|VF|VG|AG|CACG|CAC|F|G|P|N)[- ]?(\d{1,2})(?!\d)/.exec(after);
  return grade ? `${y[1]}${mint}-${Number(grade[1])}` : null;
}

// "$1" / "G$1" -> "1", "T$1" -> "T1", "25C" stays: the way the old folder names write it ("1876_T1_P65", "1891CC_5_P63CAC").
const denomKey = (d) => String(d ?? '').toUpperCase().replace(/^T\$/, 'T').replace(/^[A-Z]{0,2}\$/, '');
/** The denomination in a folder name, when it's plainly there: any "_5_" in an old one, a "-50C-" in a newer one. */
export function folderDenomination(folder) {
  const old = /_(T1|H10C|3CN|\d+\/\d+C|\d+(?:\.\d+)?C?)_/i.exec(folder);
  if (old) return old[1].toUpperCase();
  return /-(H10C|3CN|\d+C)-/i.exec(folder)?.[1].toUpperCase() ?? null;
}

// Words, with grade runs split up ("P66CAC" -> p 66 cac); numbers left out, since year and grade already matched.
const words = (s) => new Set(String(s ?? '').replace(/([a-z])(?=\d)|(\d)(?=[a-z])/gi, '$1$2 ').toLowerCase()
  .split(/[^a-z0-9]+/).filter((w) => w && !/^\d+$/.test(w)));

/**
 * Which coin a cert-less folder is: { sold: bool, name } when it's clear, { ambiguous: [names] } when the
 * candidates disagree on sold and none fits best, null when nothing matches. `coins` = [{ name, sold, live }]; a tie
 * that takes in a coin for sale on the website (live) counts as that coin, so the folder stays.
 */
export function matchByName(folder, coins) {
  const key = coinKey(folder);
  if (!key) return null;
  const d = folderDenomination(folder);
  const found = coins.filter((c) => coinKey(c.name) === key && (!d || !denominationOf(c.name) || denomKey(denominationOf(c.name)) === d));
  if (!found.length) return null;
  const fw = words(folder);
  const scored = found.map((c) => ({ c, score: [...words(c.name)].filter((w) => fw.has(w)).length })).sort((a, b) => b.score - a.score);
  const best = { sold: scored[0].c.sold, name: scored[0].c.name };
  if (found.every((c) => c.sold === best.sold)) return { ...best, count: found.length };
  if (scored[0].score > scored[1].score) return { ...best, count: 1 };
  const top = scored.filter((s) => s.score === scored[0].score);
  if (top.every((s) => s.c.sold === best.sold)) return { ...best, count: top.length };
  const live = top.find((s) => s.c.live);   // one of them is for sale on the website: that's the folder, so it stays
  if (live) return { sold: false, name: live.c.name, count: 1 };
  return { ambiguous: top.map((s) => `${s.c.name}${s.c.sold ? ' (sold)' : ''}`) };
}

// ---------------------------------------------------------------------------

async function main() {
  const { rows } = readInventory();
  const soldInWorkbook = workbookSales(rows);
  const all = await sanity().fetch(`*[_type == "listing" && !(_id in path("drafts.**"))]
    {name, sold, gradenumber, "photos": count(coalesce(imagesGallery, [])) + select(defined(image.asset) => 1, 0)}`);
  const isSold = (l) => !!l.sold || soldInWorkbook(l);
  const listings = all.filter((l) => hasCert(l.gradenumber));
  const certFor = (folder) => listings.find((l) => splitCert(folder, l.gradenumber) != null);

  // Every coin the workbook knows, sold or not (a sold coin's listing may have been deleted since).
  const coins = [];
  const byCert = new Map();
  const standIns = new Set(rows.filter((r) => STAND_INS.has(certKey(r.inventoryID))).map((r) => nameKey(r.itemDescription)));
  for (const r of rows) {
    if (r.inventoryID == null) continue;
    const cert = hasCert(r.inventoryID) ? certKey(r.inventoryID) : null;
    if (standIns.has(nameKey(r.itemDescription))) continue;   // a stand-in listing and its look-alikes: its folder stays
    const coin = { name: String(r.itemDescription ?? ''), cert, gradenumber: r.inventoryID };
    const site = cert && listings.find((l) => certKey(l.gradenumber) === cert);
    coin.sold = soldInWorkbook(coin) || !!site?.sold;
    coin.live = !!site && !isSold(site);
    coins.push(coin);
    if (cert && !byCert.has(cert)) byCert.set(cert, coin);
  }
  const rowByCert = (folder) => [...byCert.values()].find((c) => splitCert(folder, c.cert) != null);

  const moves = [];   // { from, to, del: [paths], extras: [names], name, why, how }
  for (const folder of photoFolders(inProgress)) {
    const l = certFor(folder);
    if (!l) continue;   // a draft, or not imported yet: stays put
    const dir = path.join(inProgress, folder);
    const base = splitCert(folder, l.gradenumber);
    const four = [1, 2, 3, 4].map((n) => `${base}-${n}.jpg`);
    const files = fs.readdirSync(dir);
    const soldNow = isSold(l);
    if (!four.every((f) => files.includes(f))) { moves.push({ skip: `${folder}: its 4 photos aren't all there, so it stays` }); continue; }
    if (!soldNow && l.photos < 4) { moves.push({ skip: `${folder}: the listing doesn't have its photos yet, so it stays` }); continue; }
    const del = files.filter((f) => f === 'originals' || /^DSC.*\.jpe?g$/i.test(f)).map((f) => path.join(dir, f));
    const extras = files.filter((f) => !four.includes(f) && f !== 'originals' && !/^DSC.*\.jpe?g$/i.test(f));
    moves.push({ from: dir, to: path.join(soldNow ? sold : listed, folder), del, extras, name: l.name, why: soldNow ? 'sold' : 'published' });
  }
  for (const folder of photoFolders(listed)) {
    const move = (name, how) => moves.push({ from: path.join(listed, folder), to: path.join(sold, folder), del: [], extras: [], name, why: 'sold', how });
    const l = certFor(folder);
    if (l) { if (isSold(l)) move(l.name); continue; }
    const r = rowByCert(folder);
    if (r) { if (r.sold) move(r.name); continue; }
    const m = matchByName(folder, coins);
    if (m?.ambiguous) moves.push({ skip: `${folder}: could be ${m.ambiguous.join(' or ')}, so it stays (file it by hand, or end the folder name with the cert #)` });
    else if (m?.sold) move(m.name, `matched by year, mint and grade: "${folder}"${m.count > 1 ? `; all ${m.count} such coins have sold` : ''}`);
  }

  const todo = moves.filter((m) => !m.skip);
  const clash = todo.filter((m) => fs.existsSync(m.to));
  console.log('Photo folders');
  if (!todo.length) console.log('  Nothing to file.');
  for (const m of todo) {
    const freed = m.del.reduce((t, p) => t + sizeOf(p), 0);
    console.log(`  ${m.why === 'sold' ? '$' : '→'} ${m.name}`);
    console.log(`      ${path.basename(path.dirname(m.from))} -> ${path.basename(path.dirname(m.to))}${m.del.length ? `, deleting the camera shots (${mb(freed)})` : ''}`);
    if (m.how) console.log(`      ${m.how}`);
    if (m.extras.length) console.log(`      also moving (not one of the 4 photos): ${m.extras.join(', ')}`);
    if (clash.includes(m)) console.log(`      ✗ can't: "${path.basename(m.to)}" is already there — sort that out by hand`);
  }
  for (const m of moves.filter((x) => x.skip)) console.log(`  · ${m.skip}`);

  const ok = todo.filter((m) => !clash.includes(m));
  if (!ok.length) return;
  if (!APPLY) {
    if (ASK && await askYes(`\nPhotos: file ${ok.length} folder(s)${ok.some((m) => m.del.length) ? ' and delete their camera shots' : ''}? (y/N) `)) APPLY = true;
    else { console.log(ASK ? '\nNo folders moved.' : '\nPreview only: nothing moved or deleted.'); return; }
  }
  for (const m of ok) {
    for (const p of m.del) fs.rmSync(p, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(m.to), { recursive: true });
    try { fs.renameSync(m.from, m.to); } catch { fs.cpSync(m.from, m.to, { recursive: true }); fs.rmSync(m.from, { recursive: true, force: true }); }
    console.log(`  ✓ ${path.basename(m.to)}`);
  }
  console.log(`\nFiled ${ok.length} folder(s).`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(`\n✗ ${err.message}`);
    process.exitCode = 1;
  });
}
