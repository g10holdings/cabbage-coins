/**
 * The website part of 4_After-Publishing-or-Selling: marks coins sold on cabbagecoins.com from the WORKBOOK.
 *
 * For each published listing whose coin is Sold in the workbook (sold.js rules: by cert, every row for it Sold; no-cert
 * items by name), it ticks the Studio's Sold box and copies the workbook's Sell Date into `soldDate`. A coin already
 * ticked Sold gets its soldDate filled or corrected the same way. soldDate drives the archive: a sold coin stays on
 * /inventory/ for 10 days after its sale, then moves to /past-sales/ (web/.eleventy.js, ARCHIVE_DAYS).
 *
 * The workbook is only READ (workbook.js). A coin ticked Sold in the Studio that the workbook still calls Active is
 * left alone and named on screen; if it has no sale date yet, it gets today's.
 *
 * After a change it starts a Netlify build, since Sanity edits don't rebuild the site on their own.
 *
 *   node site-sold.js          preview
 *   node site-sold.js --ask    preview, then ask (4_After-Publishing-or-Selling)
 *   node site-sold.js --apply  do it without asking
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { readInventory, certKey, nameKey, hasCert } from './workbook.js';
import { workbookSales, STAND_INS } from './sold.js';
import { sanity } from './settings.js';
import { askYes } from './ask.js';

const NETLIFY_SITE = 'cb6571b6-a8a7-4db5-b71c-687c4f9117db';   // cabbage-coins2 (the live site)

/** A Date (or date-ish cell) -> "2026-11-05" in local time (SheetJS gives local midnight as a Date). */
export function ymd(v) {
  if (v == null || v === '') return null;
  const d = v instanceof Date ? v : new Date(v);
  if (isNaN(d)) return null;
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Works out what to change. Pure (no reads or writes), so the tests can call it.
 * Returns { markSold: [...], fixDate: [...], studioOnly: [...] }, each item { listing, soldDate, note? }.
 */
export function planSiteSold(listings, rows, today = ymd(new Date())) {
  const isSold = workbookSales(rows);
  const rowsOf = (l) => {
    const cert = hasCert(l.gradenumber) ? certKey(l.gradenumber) : null;
    return rows.filter((r) => r.inventoryID != null &&
      (cert ? hasCert(r.inventoryID) && certKey(r.inventoryID) === cert : nameKey(r.itemDescription) === nameKey(l.name)));
  };
  // The latest Sell Date among the coin's rows (a coin sold, bought back as "_2" and sold again: the last sale).
  const saleDate = (l) => rowsOf(l).map((r) => ymd(r['Sell Date'])).filter(Boolean).sort().pop() ?? null;

  const plan = { markSold: [], fixDate: [], studioOnly: [] };
  for (const l of listings) {
    if (hasCert(l.gradenumber) && STAND_INS.has(certKey(l.gradenumber))) continue;
    if (isSold(l)) {
      const date = saleDate(l);
      const note = !date ? 'no Sell Date in the workbook, using today' : date > today ? 'Sell Date is in the FUTURE in the workbook (typo?)' : null;
      const soldDate = date ?? today;
      if (!l.sold) plan.markSold.push({ listing: l, soldDate, note });
      else if (l.soldDate !== soldDate) plan.fixDate.push({ listing: l, soldDate, was: l.soldDate ?? null, note });
    } else if (l.sold) {
      plan.studioOnly.push({ listing: l, soldDate: l.soldDate ?? today, needsDate: !l.soldDate });
    }
  }
  return plan;
}

async function startBuild() {
  const cfgPath = path.join(process.env.APPDATA ?? '', 'netlify', 'Config', 'config.json');
  let token;
  try {
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    token = cfg.users?.[cfg.userId]?.auth?.token;
  } catch { /* no Netlify login on this computer */ }
  if (!token) {
    console.log('  ! Could not start the site build (no Netlify login found). In Netlify: cabbage-coins2 > Deploys > Trigger deploy.');
    return;
  }
  const res = await fetch(`https://api.netlify.com/api/v1/sites/${NETLIFY_SITE}/builds`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
  console.log(res.ok
    ? '  ✔ Site build started. The website shows the change in about 2–3 minutes.'
    : `  ! The site build didn't start (Netlify said ${res.status}). In Netlify: cabbage-coins2 > Deploys > Trigger deploy.`);
}

async function main() {
  const args = process.argv.slice(2);
  const ASK = args.includes('--ask');
  let APPLY = args.includes('--apply');

  const { rows, savedAt } = readInventory(undefined, ['inventoryID', 'itemDescription', 'Status', 'Sell Date']);
  console.log(`Workbook last saved ${savedAt.toLocaleString()}. (A sale you just typed in counts only once Excel has SAVED it.)`);
  const client = sanity();
  const listings = await client.fetch(`*[_type == "listing" && !(_id in path("drafts.**"))]{_id, name, gradenumber, sold, soldDate}`);
  const plan = planSiteSold(listings, rows);

  const line = (x) => `    ${x.listing.name}  (sold ${x.soldDate})${x.note ? `  ! ${x.note}` : ''}`;
  if (plan.markSold.length) {
    console.log(`\n  MARK SOLD on the website (${plan.markSold.length}):`);
    plan.markSold.forEach((x) => console.log(line(x)));
  }
  if (plan.fixDate.length) {
    console.log(`\n  Sale date filled in or corrected (${plan.fixDate.length}), already marked sold:`);
    plan.fixDate.forEach((x) => console.log(line(x) + (x.was ? `  (was ${x.was})` : '')));
  }
  const undated = plan.studioOnly.filter((x) => x.needsDate);
  if (plan.studioOnly.length) {
    console.log(`\n  Sold on the website but NOT Sold in the workbook (${plan.studioOnly.length}) — left as they are:`);
    plan.studioOnly.forEach((x) => console.log(`    ${x.listing.name}  (${x.listing.gradenumber})${x.needsDate ? `  — gets today's date (${x.soldDate}) for the archive` : ''}`));
  }
  const changes = [...plan.markSold, ...plan.fixDate, ...undated];
  if (!changes.length) {
    console.log('\n  Website is up to date: every coin sold in the workbook is marked sold, with its sale date.');
    return;
  }

  if (ASK && !APPLY) APPLY = await askYes(`\nUpdate ${changes.length} listing(s) on the website and rebuild the site? (y/N) `);
  if (!APPLY) { console.log('  Nothing changed.'); return; }

  const tx = client.transaction();
  for (const x of plan.markSold) tx.patch(x.listing._id, (p) => p.set({ sold: true, soldDate: x.soldDate }));
  for (const x of [...plan.fixDate, ...undated]) tx.patch(x.listing._id, (p) => p.set({ soldDate: x.soldDate }));
  await tx.commit();
  console.log(`  ✔ ${changes.length} listing(s) updated.`);
  await startBuild();
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(`\n  ERROR: ${e.message}`); process.exitCode = 1; });
}
