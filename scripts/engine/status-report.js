/**
 * Where every coin stands, from workbook to website to marketplaces, in one page. Changes NOTHING anywhere.
 *
 * For each coin it puts together:
 *   workbook   Website R (ready) / Y (live), Active / Sold          (inventory sheet, read-only: workbook.js)
 *   photos     folder in waiting_website (made or not), doneUnsold or doneSOLD (by the cert # in the name)
 *   listing    draft / published / sold; photos, caption, description, PCGS population
 *   CAC, eBay  on it or not, as of each one's last send (their ledgers in Sanity; no CAC or eBay calls)
 * and works out the next step. It also runs the old workbook check: sold-but-for-sale, prices, grades, PCGS #s...
 *
 * Writes .status-report.html next to this file and opens it in the browser; a short summary goes to the window.
 *   node status-report.js            (5_Status-Report)
 *   node status-report.js --no-open  just write it
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { readInventory, certKey, nameKey, hasCert, listingFromRow } from './workbook.js';
import { photoFolders, findPhotos, splitCert } from './listing-photos.js';
import { settings, sanity, ENGINE } from './settings.js';
import { STAND_INS } from './sold.js';

const OUT = path.join(ENGINE, '.status-report.html');
const NO_OPEN = process.argv.includes('--no-open');

// Listings the workbook check leaves alone, by cert # (Tony, 2026-10-17).
const IGNORE = STAND_INS;
// The grading services CAC's marketplace takes (cac-marketplace.js).
const CAC_SERVICES = new Set(['PCGS', 'NGC', 'CACG']);

const money = (n) => (n == null || n === '' ? '—' : `$${Number(n).toLocaleString()}`);
const loose = (s) => String(s ?? '').toUpperCase().replace(/\s+/g, '');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const hasText = (v) => (Array.isArray(v) ? v.length > 0 : v != null && String(v).trim() !== '');

async function main() {
  const client = sanity();
  const { rows, file, savedAt } = readInventory();
  const [listings, cacDoc, ebayDoc] = await Promise.all([
    client.fetch(`*[_type == "listing"]{_id, name, sold, price, gradenumber, date, dateshown, grade, gradingCompany, cac,
      pcgsCatalogNumber, pcgsDesignationNumber, notOnEbay, "slug": slug.current, "photo": image.asset._ref, "caption": image.caption,
      "gallery": count(coalesce(imagesGallery, [])), description, "pop": defined(pcgsPop.thisPop)}`),
    client.getDocument('cac-marketplace-ledger'),
    client.getDocument('ebay-ledger'),
  ]);
  const onCac = new Set(Object.keys(cacDoc?.entries ? JSON.parse(cacDoc.entries) : {}));
  const onEbay = new Set(Object.keys(ebayDoc?.entries ? JSON.parse(ebayDoc.entries) : {}));
  const folders = {
    inProgress: photoFolders(settings.photos.inProgress),
    listed: photoFolders(settings.photos.listed),
    sold: photoFolders(settings.photos.sold),
  };

  // Workbook rows by cert (a later "_2" row wins) and by name (for items with no cert).
  const book = new Map(), bookByName = new Map();
  for (const r of rows) {
    if (r.inventoryID == null) continue;
    const w = listingFromRow(r);
    book.set(w.key, w);
    bookByName.set(nameKey(w.name), w);
  }
  const rowFor = (l) => (hasCert(l.gradenumber) ? book.get(certKey(l.gradenumber)) : null) ?? bookByName.get(nameKey(l.name));

  // A listing's published and draft versions are one coin: the published one leads, the draft means unpublished edits.
  const byId = new Map();
  for (const l of listings) {
    const id = l._id.replace(/^drafts\./, '');
    const slot = byId.get(id) ?? {};
    if (l._id.startsWith('drafts.')) slot.draft = l; else slot.pub = l;
    byId.set(id, slot);
  }

  const photoState = (cert) => {
    if (!hasCert(cert)) return { where: null };
    const ip = findPhotos(cert, folders.inProgress, settings.photos.inProgress);
    if (ip) return { where: 'inProgress', ready: ip.ready, folder: ip.folder };
    if (folders.listed.some((f) => splitCert(f, cert) != null)) return { where: 'listed' };
    if (folders.sold.some((f) => splitCert(f, cert) != null)) return { where: 'sold' };
    return { where: null };
  };

  const coins = [];
  const seenKeys = new Set();
  for (const [id, { pub, draft }] of byId) {
    const l = pub ?? draft;
    const w = rowFor(l);
    if (w) seenKeys.add(w.key);
    const state = !pub ? 'draft' : pub.sold ? 'sold' : 'live';
    const cacEligible = CAC_SERVICES.has(l.gradingCompany) && l.pcgsCatalogNumber && l.price && l.slug && l.photo;
    coins.push({
      id, name: l.name, cert: l.gradenumber, price: l.price, w, state, hasDraftEdits: !!(pub && draft),
      photos: photoState(l.gradenumber),
      onListing: (l.photo ? 1 : 0) + (l.gallery ?? 0),
      caption: hasText(l.caption), description: hasText(l.description),
      pop: l.gradingCompany === 'PCGS' ? (l.pop ? 'yes' : 'no') : 'n/a',
      cac: state === 'draft' ? null : onCac.has(id) ? 'on' : state === 'sold' ? 'off' : cacEligible ? 'waiting' : 'n/a',
      ebay: state === 'draft' ? null : onEbay.has(id) ? 'on' : state === 'sold' ? 'off' : l.notOnEbay ? 'kept off' : 'waiting',
      l,
    });
  }
  // Ready in the workbook, not imported yet.
  for (const w of book.values()) {
    if (w.website !== 'R' || w.status !== 'Active' || seenKeys.has(w.key)) continue;
    if (listings.some((l) => nameKey(l.name) === nameKey(w.name))) continue;
    coins.push({ id: null, name: w.name, cert: w.cert, price: w.price, w, state: 'ready', photos: photoState(w.cert), onListing: 0 });
  }

  for (const c of coins) c.next = nextStep(c);

  // ---- the workbook check (what used to be check-workbook.js) ----
  const problems = [];
  const diffs = [], names = [];
  for (const c of coins.filter((x) => x.state === 'live' && !IGNORE.has(certKey(x.cert)))) {
    const { l, w } = c;
    if (!w) { problems.push(`On the site, with no workbook row for its cert # ("${c.cert ?? ''}"): ${c.name}`); continue; }
    if (w.status === 'Sold') problems.push(`For sale on the site, but SOLD in the workbook: ${c.name} (site ${money(l.price)}, sold for ${money(w.price)})`);
    else if (w.website !== 'Y' && w.website !== 'R') problems.push(`For sale on the site, but the workbook's Website column says "${w.website || 'blank'}": ${c.name}`);
    const d = [];
    if (w.status !== 'Sold' && Number(l.price) !== w.price) d.push(`price: site ${money(l.price)}, workbook ${money(w.price)}`);
    if (loose(l.grade) !== loose(w.grade) && w.grade) d.push(`grade: site "${l.grade}", workbook "${w.grade}"`);
    if (l.gradingCompany !== w.gradingCompany) d.push(`grading company: site ${l.gradingCompany}, workbook ${w.gradingCompany}`);
    if (loose(l.dateshown) !== loose(w.dateShown) && w.dateShown) d.push(`date shown: site "${l.dateshown}", workbook "${w.dateShown}"`);
    if (w.pcgsCatalogNumber && Number(l.pcgsCatalogNumber) !== w.pcgsCatalogNumber) d.push(`PCGS catalog #: site ${l.pcgsCatalogNumber ?? '—'}, workbook ${w.pcgsCatalogNumber}`);
    const designation = w.pcgsPopNumber !== w.pcgsCatalogNumber ? w.pcgsPopNumber : null;
    if ((l.pcgsDesignationNumber ?? null) !== designation) d.push(`PCGS # with designation: site ${l.pcgsDesignationNumber ?? '—'}, workbook ${designation ?? '—'}`);
    if (d.length) diffs.push([c.name, d]);
    if (loose(l.name) !== loose(w.name)) names.push([l.name, w.name]);
  }
  for (const w of book.values()) {
    if (w.website === 'Y' && w.status === 'Active' && !seenKeys.has(w.key) && !listings.some((l) => nameKey(l.name) === nameKey(w.name)))
      problems.push(`Workbook says Website = Y (live), but there's no listing at all: ${w.name} (cert ${w.cert})`);
  }
  const ignored = coins.filter((c) => c.state === 'live' && IGNORE.has(certKey(c.cert)));

  // ---- output ----
  const inProgress = coins.filter((c) => c.state === 'ready' || c.state === 'draft');
  const live = coins.filter((c) => c.state === 'live');
  const sold = coins.filter((c) => c.state === 'sold');
  const liveTodo = live.filter((c) => c.next);
  const soldTodo = sold.filter((c) => c.next);

  console.log(`Workbook: ${file} (saved ${savedAt.toLocaleString()}; opened read-only)`);
  console.log(`In progress: ${inProgress.length}   Live: ${live.length} (${liveTodo.length} with something to do)   Sold with loose ends: ${soldTodo.length}`);
  console.log(`Workbook mismatches: ${problems.length + diffs.length}`);
  for (const c of [...inProgress, ...liveTodo, ...soldTodo]) console.log(`  · ${c.name}: ${c.next ?? 'nothing to do'}`);

  fs.writeFileSync(OUT, html({ file, savedAt, inProgress, live, liveTodo, sold, soldTodo, problems, diffs, names, ignored }));
  console.log(`\nFull report: ${OUT}`);
  if (!NO_OPEN) spawn('cmd', ['/c', 'start', '', OUT], { detached: true, stdio: 'ignore' }).unref();
  console.log('Nothing was changed, in the workbook, the website, CAC or eBay.');
}

/** The one thing to do next for a coin, naming the launcher; null when it's all done. */
export function nextStep(c) {
  const { w, photos } = c;
  if (c.state === 'ready') {
    if (photos.where === 'inProgress' && !photos.ready) return 'Make its photos: 1_Prep-Photos';
    if (photos.where === 'inProgress') return 'Create the listing: 2_Import-Listings';
    return 'Create the listing: 2_Import-Listings (no photo folder yet: export one ending in the cert #, or add photos in the Studio)';
  }
  if (c.state === 'draft') {
    if (c.onListing < 4) {
      if (photos.where === 'inProgress' && photos.ready) return 'Add its photos: 2_Import-Listings';
      if (photos.where === 'inProgress') return 'Make its photos: 1_Prep-Photos, then 2_Import-Listings';
      return 'Add photos in the Studio (no photo folder ending in its cert #)';
    }
    if (!c.caption) return 'Choose a caption: 3_Choose-Captions';
    if (!c.description) return 'Write the description in the Studio, then Publish';
    return 'Publish in the Studio';
  }
  const todo = [];
  if (c.state === 'live') {
    if (c.hasDraftEdits) todo.push('unpublished edits in the Studio (Publish or discard them)');
    if (w && w.website === 'R') todo.push('set Website = Y in the workbook');
    if (c.cac === 'waiting' || c.ebay === 'waiting' || photos.where === 'inProgress') todo.push('4_After-Publishing-or-Selling');
    if (c.pop === 'no') todo.push('PCGS population: Extras\\Fill-PCGS-Pop');
  }
  if (c.state === 'sold') {
    if (c.cac === 'on' || c.ebay === 'on' || photos.where === 'listed' || photos.where === 'inProgress') todo.push('take down / file photos: 4_After-Publishing-or-Selling');
  }
  return todo.length ? todo.join('; ') : null;
}

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------
const mark = (v, label) => {
  const cls = v === true || v === 'yes' || v === 'on' ? 'ok' : v === 'n/a' || v === 'kept off' || v === 'off' || v == null ? 'na' : 'todo';
  const txt = label ?? (v === true || v === 'yes' ? '✓' : v === false || v === 'no' ? '·' : v ?? '');
  return `<td class="${cls}">${esc(txt)}</td>`;
};
const photoCell = (p) => {
  if (p.where === 'inProgress') return mark(p.ready ? true : false, p.ready ? 'made' : 'not made');
  if (p.where === 'listed') return mark('yes', 'doneUnsold');
  if (p.where === 'sold') return mark('yes', 'doneSOLD');
  return mark('n/a', '—');
};
const book = (w) => (w ? mark(w.website === 'Y' ? 'yes' : w.website === 'R' ? 'no' : 'n/a', w.website || '—') : mark('n/a', 'no row'));

function table(coins, cols) {
  if (!coins.length) return '<p class="none">None.</p>';
  const head = cols.map((c) => `<th>${c}</th>`).join('');
  const body = coins.map((c) => `<tr><td class="name">${esc(c.name)}<span class="cert">${esc(c.cert ?? '')}</span></td>${
    cols.slice(1, -1).map((col) => cellFor(col, c)).join('')}<td class="next">${esc(c.next ?? '—')}</td></tr>`).join('\n');
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}
function cellFor(col, c) {
  switch (col) {
    case 'Workbook': return book(c.w);
    case 'Photo folder': return photoCell(c.photos);
    case 'Listing': return mark(c.state === 'ready' ? 'no' : 'yes', c.state === 'ready' ? 'not yet' : c.state);
    case 'Photos on it': return c.state === 'ready' ? mark('n/a', '') : mark(c.onListing >= 4 ? 'yes' : 'no', `${c.onListing} of 4`);
    case 'Caption': return c.state === 'ready' ? mark('n/a', '') : mark(c.caption);
    case 'Description': return c.state === 'ready' ? mark('n/a', '') : mark(c.description);
    case 'PCGS pop': return c.state === 'ready' ? mark('n/a', '') : mark(c.pop);
    case 'CAC': return mark(c.cac ?? 'n/a', c.cac ?? '');
    case 'eBay': return mark(c.ebay ?? 'n/a', c.ebay ?? '');
    case 'Price': return `<td class="num">${money(c.price)}</td>`;
    default: return '<td></td>';
  }
}

function html({ file, savedAt, inProgress, live, liveTodo, sold, soldTodo, problems, diffs, names, ignored }) {
  const liveOk = live.filter((c) => !c.next);
  const list = (items) => `<ul>${items.map((x) => `<li>${x}</li>`).join('')}</ul>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Coin Status</title>
<style>
:root{--bg:#fbfaf7;--fg:#1d1d1b;--muted:#77756f;--line:#e4e1d8;--ok:#2e7d4f;--todo:#b4580a;--todo-bg:#fff3e2;--head:#f1eee6}
@media (prefers-color-scheme:dark){:root{--bg:#171715;--fg:#ecebe6;--muted:#9a978e;--line:#33322e;--ok:#6fc28f;--todo:#f0a050;--todo-bg:#3a2a15;--head:#22211e}}
body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1400px;margin:0 auto;padding:24px 16px 64px}
h1{font-size:22px;margin:0 0 4px} h2{font-size:17px;margin:32px 0 8px} .sub{color:var(--muted);margin:0 0 16px}
.cards{display:flex;flex-wrap:wrap;gap:10px;margin:16px 0}
.card{border:1px solid var(--line);border-radius:8px;padding:10px 14px;min-width:150px} .card b{display:block;font-size:22px}
.wrap{overflow-x:auto} table{border-collapse:collapse;width:100%;min-width:900px}
th,td{border-bottom:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top}
th{background:var(--head);font-weight:600;font-size:12px;position:sticky;top:0}
td.name{min-width:260px} .cert{display:block;color:var(--muted);font-size:12px}
td.ok{color:var(--ok)} td.na{color:var(--muted)} td.todo{color:var(--todo);background:var(--todo-bg);font-weight:600}
td.next{min-width:220px} td.num{text-align:right;white-space:nowrap}
.none{color:var(--muted)} details{margin-top:12px} summary{cursor:pointer;color:var(--muted)}
ul{margin:6px 0;padding-left:20px} li{margin:3px 0}
.warn{border-left:4px solid var(--todo);padding:4px 12px;background:var(--todo-bg);border-radius:4px}
</style></head><body><main>
<h1>Where every coin stands</h1>
<p class="sub">${esc(new Date().toLocaleString())} · workbook saved ${esc(savedAt.toLocaleString())} (read only) · CAC and eBay as of each one's last send · nothing was changed</p>
<div class="cards">
<div class="card"><b>${inProgress.length}</b>in progress</div>
<div class="card"><b>${live.length}</b>live on the site</div>
<div class="card"><b>${liveTodo.length}</b>live, with something to do</div>
<div class="card"><b>${soldTodo.length}</b>sold, with loose ends</div>
<div class="card"><b>${problems.length + diffs.length}</b>workbook mismatches</div>
</div>
${problems.length || diffs.length ? `<h2>Workbook mismatches</h2><div class="warn">${list([...problems.map(esc), ...diffs.map(([n, d]) => `${esc(n)}<br><small>${d.map(esc).join('<br>')}</small>`)])}</div>` : ''}
<h2>In progress (Website = R, or a draft)</h2>
<div class="wrap">${table(inProgress, ['Coin', 'Workbook', 'Photo folder', 'Listing', 'Photos on it', 'Caption', 'Description', 'PCGS pop', 'Next'])}</div>
<h2>Live on the site: something to do</h2>
<div class="wrap">${table(liveTodo, ['Coin', 'Price', 'Workbook', 'Photo folder', 'CAC', 'eBay', 'PCGS pop', 'Next'])}</div>
<details><summary>Live and all in order (${liveOk.length})</summary><div class="wrap">${table(liveOk, ['Coin', 'Price', 'Workbook', 'Photo folder', 'CAC', 'eBay', 'PCGS pop', 'Next'])}</div></details>
<h2>Sold: loose ends</h2>
<div class="wrap">${table(soldTodo, ['Coin', 'Price', 'Photo folder', 'CAC', 'eBay', 'Next'])}</div>
<details><summary>Names worded differently on the site than in the workbook (${names.length}, not an error)</summary>${list(names.map(([s, b]) => `site: ${esc(s)}<br>workbook: ${esc(b)}`))}</details>
${ignored.length ? `<details><summary>Not checked on purpose (${ignored.length})</summary>${list(ignored.map((c) => esc(c.name)))}</details>` : ''}
<p class="sub" style="margin-top:32px">Photo folders: found by the cert # at the end of the folder name (older folders without one show "—"). Workbook: ${esc(file)}</p>
</main></body></html>`;
}

// Run only when started directly (tests import nextStep without running anything).
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(`\n✗ ${err.message}`);
    process.exitCode = 1;
  });
}
