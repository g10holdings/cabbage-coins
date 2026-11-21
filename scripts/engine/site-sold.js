/**
 * The website part of 4_After-Publishing-or-Selling: makes cabbagecoins.com match the WORKBOOK.
 *
 * First, the workbook check (Tony, 2026-11-14) — the workbook drives the website, and the website drives eBay and
 * CAC (the later parts of step 4 read the website's prices):
 *   - every coin live on the website should say "Y" in the workbook's Website column (or have a row at all);
 *     the ones that don't are listed, nothing is changed — that's fixed in the workbook;
 *   - every live coin's website price is set to the workbook's listPrice where they differ (an open Studio
 *     draft of that listing gets the new price too, so publishing it later doesn't bring the old price back).
 *
 * Then the sold coins:
 *
 * For each published listing whose coin is Sold in the workbook (sold.js rules: by cert, every row for it Sold; no-cert
 * items by name), it ticks the Studio's Sold box and copies the workbook's Sell Date into `soldDate`. A coin already
 * ticked Sold gets its soldDate filled or corrected the same way. soldDate drives the archive: a sold coin stays on
 * /inventory/ for 10 days after its sale, then moves to /past-sales/ (web/.eleventy.js, ARCHIVE_DAYS).
 *
 * Back in stock: a listing ticked Sold whose coin the workbook has Active again (a "_2" row) with Website R or Y is
 * put back on sale (Sold unticked, soldDate cleared, price = that row's listPrice), so it leaves Past Sales.
 *
 * The workbook is only READ (workbook.js). Any other coin ticked Sold in the Studio that the workbook still calls
 * Active is left alone and named on screen; if it has no sale date yet, it gets today's.
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
 * Returns { markSold, fixDate, studioOnly, relist }: each item { listing, soldDate, note? }; relist items are
 * { listing, inventoryID, price, note } (a sold listing whose coin is back in stock with Website R or Y).
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

  const plan = { markSold: [], fixDate: [], studioOnly: [], relist: [] };
  for (const l of listings) {
    if (hasCert(l.gradenumber) && STAND_INS.has(certKey(l.gradenumber))) continue;
    // Back in stock (Tony, 2026-11-19): sold on the website, but the workbook has the coin Active again (a "_2" row)
    // and its Website says R or Y -> put the old listing back on sale at that row's listPrice.
    if (l.sold && !isSold(l)) {
      const back = rowsOf(l).filter((r) => isActive(r) && /^[ry]$/i.test(String(r.Website ?? '').trim()));
      if (back.length) {
        const r = back[back.length - 1];   // the latest row ("_3" after "_2")
        const price = Number(r.listPrice) > 0 ? Number(r.listPrice) : null;
        plan.relist.push({ listing: l, inventoryID: r.inventoryID, price, note: price ? null : 'no listPrice in the workbook, old price kept' });
        continue;
      }
    }
    if (isSold(l)) {
      const date = saleDate(l);
      // Layaway (Tony, 2026-11-11): Sold with a FUTURE Sell Date = sold, waiting on the final payment. The coin is
      // gone now, so its sale date is the day it was first marked sold. A sale date already on the listing that is
      // EARLIER than the workbook's is kept, so a layaway that gets its real (later) Sell Date doesn't come back
      // onto Inventory for another 10 days.
      const layaway = !!date && date > today;
      const note = !date ? 'no Sell Date in the workbook, using today' : layaway ? 'layaway (Sell Date in the future)' : null;
      let soldDate = layaway || !date ? (l.soldDate ?? today) : date;
      if (l.soldDate && l.soldDate < soldDate) soldDate = l.soldDate;
      if (!l.sold) plan.markSold.push({ listing: l, soldDate, note });
      else if (l.soldDate !== soldDate) plan.fixDate.push({ listing: l, soldDate, was: l.soldDate ?? null, note });
    } else if (l.sold) {
      plan.studioOnly.push({ listing: l, soldDate: l.soldDate ?? today, needsDate: !l.soldDate });
    }
  }
  return plan;
}

const isActive = (r) => !/^sold$/i.test(String(r.Status ?? '').trim());

/**
 * The coin's ACTIVE workbook row(s): by cert (a "_2" row back in stock counts), else — for items whose listing
 * number isn't the workbook ID, like ingot "535" = row "SF_535" — the one active row with exactly the same name.
 */
export function activeRowsOf(l, rows) {
  const cert = hasCert(l.gradenumber) ? certKey(l.gradenumber) : null;
  const live = rows.filter((r) => r.inventoryID != null && isActive(r));
  const byCert = cert ? live.filter((r) => hasCert(r.inventoryID) && certKey(r.inventoryID) === cert) : [];
  if (byCert.length) return byCert;
  const byName = live.filter((r) => nameKey(r.itemDescription) === nameKey(l.name));
  return byName.length === 1 ? byName : [];
}

/**
 * The workbook check. Pure, like planSiteSold. `listings` are the published ones; coins already ticked Sold, or
 * about to be marked sold by this run (`soldNow`, listing ids), aren't live and are skipped.
 *
 * A STAND_IN (one listing shown for several identical coins, e.g. the Palladium Eagles) has a Sold row of its own, so
 * its price comes from the ACTIVE rows with the same description as its row (Tony, 2026-11-19): when they all have the
 * same listPrice, that's the website price; when they differ it's listed (`standInMixed`) and left alone; when none
 * is left in stock it's listed too (`standInNone`). The Website column isn't checked for a stand-in.
 * Returns { notY, noRow, several, price, noPrice, standInMixed, standInNone }.
 */
export function planWorkbookCheck(listings, rows, soldNow = new Set()) {
  const plan = { notY: [], noRow: [], several: [], price: [], noPrice: [], standInMixed: [], standInNone: [] };
  for (const l of listings) {
    if (l.sold || soldNow.has(l._id)) continue;
    if (hasCert(l.gradenumber) && STAND_INS.has(certKey(l.gradenumber))) {
      standInPrice(l, rows, plan);
      continue;
    }
    const mine = activeRowsOf(l, rows);
    if (!mine.length) { plan.noRow.push({ listing: l }); continue; }
    if (mine.length > 1) { plan.several.push({ listing: l, ids: mine.map((r) => r.inventoryID) }); continue; }
    const r = mine[0];
    if (String(r.Website ?? '').trim().toUpperCase() !== 'Y') {
      plan.notY.push({ listing: l, inventoryID: r.inventoryID, website: String(r.Website ?? '').trim() });
    }
    const want = Number(r.listPrice);
    if (!(want > 0)) plan.noPrice.push({ listing: l, inventoryID: r.inventoryID });
    else if (Math.abs(want - (Number(l.price) || 0)) > 0.005) {
      plan.price.push({ listing: l, inventoryID: r.inventoryID, from: l.price ?? null, to: want });
    }
  }
  return plan;
}

/** The stand-in's price from its identical coins still in stock (see planWorkbookCheck). */
function standInPrice(l, rows, plan) {
  const cert = certKey(l.gradenumber);
  const own = rows.find((r) => r.inventoryID != null && hasCert(r.inventoryID) && certKey(r.inventoryID) === cert);
  const name = nameKey(own ? own.itemDescription : l.name);
  const twins = rows.filter((r) => r.inventoryID != null && isActive(r) && nameKey(r.itemDescription) === name);
  if (!twins.length) { plan.standInNone.push({ listing: l }); return; }
  const prices = [...new Set(twins.map((r) => Number(r.listPrice)).filter((n) => n > 0))];
  const ids = twins.map((r) => r.inventoryID);
  if (!prices.length) { plan.noPrice.push({ listing: l, inventoryID: ids.join(', ') }); return; }
  if (prices.length > 1) {
    plan.standInMixed.push({ listing: l, rows: twins.map((r) => `${r.inventoryID} $${Number(r.listPrice) || '-'}`) });
    return;
  }
  if (Math.abs(prices[0] - (Number(l.price) || 0)) > 0.005) {
    plan.price.push({ listing: l, inventoryID: ids.join(', '), from: l.price ?? null, to: prices[0], standIn: true });
  }
}

/** Starts a Netlify build of the live site (uses the Netlify CLI login on this computer). Also used by youtube-shorts.js. */
export async function startBuild() {
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

  const { rows, savedAt } = readInventory(undefined, ['inventoryID', 'itemDescription', 'Status', 'Sell Date', 'Website', 'listPrice']);
  console.log(`Workbook last saved ${savedAt.toLocaleString()}. (A change you just typed in counts only once Excel has SAVED it.)`);
  const client = sanity();
  const listings = await client.fetch(`*[_type == "listing" && !(_id in path("drafts.**"))]{_id, name, gradenumber, sold, soldDate, price}`);
  const drafts = new Set(await client.fetch(`*[_type == "listing" && _id in path("drafts.**")]._id`));
  const plan = planSiteSold(listings, rows);
  const check = planWorkbookCheck(listings, rows, new Set(plan.markSold.map((x) => x.listing._id)));

  // The workbook check comes first.
  const usd = (n) => (n == null ? 'no price' : `$${Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 })}`);
  console.log('\n  WORKBOOK CHECK');
  if (check.notY.length) {
    console.log(`  Live on the website but not "Y" in the workbook's Website column (${check.notY.length}) — fix in the workbook:`);
    check.notY.forEach((x) => console.log(`    ${x.listing.name}  (row ${x.inventoryID}: Website is ${x.website ? `"${x.website}"` : 'blank'})`));
  }
  if (check.noRow.length) {
    console.log(`  Live on the website but no Active row in the workbook (${check.noRow.length}) — check the cert # / name:`);
    check.noRow.forEach((x) => console.log(`    ${x.listing.name}  (${x.listing.gradenumber ?? 'no cert #'})`));
  }
  if (check.several.length) {
    console.log(`  Several Active workbook rows for one coin (${check.several.length}) — price not changed:`);
    check.several.forEach((x) => console.log(`    ${x.listing.name}  (rows ${x.ids.join(', ')})`));
  }
  if (!check.notY.length && !check.noRow.length && !check.several.length) {
    console.log('  Every coin live on the website says "Y" in the workbook.');
  }
  if (check.standInMixed.length) {
    console.log(`  Stand-in listing: its coins in stock have DIFFERENT listPrices (${check.standInMixed.length}) — price not changed:`);
    check.standInMixed.forEach((x) => console.log(`    ${x.listing.name}  (${x.rows.join(', ')})`));
  }
  if (check.standInNone.length) {
    console.log(`  Stand-in listing with none of its coins left Active in the workbook (${check.standInNone.length}) — take it down?`);
    check.standInNone.forEach((x) => console.log(`    ${x.listing.name}  (${x.listing.gradenumber})`));
  }
  if (check.noPrice.length) {
    console.log(`  No listPrice in the workbook (${check.noPrice.length}) — website price left as it is:`);
    check.noPrice.forEach((x) => console.log(`    ${x.listing.name}  (row ${x.inventoryID}; website ${usd(x.listing.price)})`));
  }
  if (check.price.length) {
    console.log(`  PRICE CHANGE from the workbook's listPrice (${check.price.length}):`);
    check.price.forEach((x) => console.log(`    ${x.listing.name}  ${usd(x.from)} -> ${usd(x.to)}${x.standIn ? `  (stand-in; rows ${x.inventoryID})` : ''}${drafts.has(`drafts.${x.listing._id}`) ? '  (its open Studio draft too)' : ''}`));
  } else {
    console.log('  Prices: every live coin\'s website price matches the workbook\'s listPrice.');
  }

  console.log('\n  SOLD COINS');
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
  if (plan.relist.length) {
    console.log(`\n  BACK IN STOCK: put back on sale on the website (${plan.relist.length}) — leaves Past Sales:`);
    plan.relist.forEach((x) => console.log(`    ${x.listing.name}  (row ${x.inventoryID}) at ${usd(x.price ?? x.listing.price)}${x.note ? `  ! ${x.note}` : ''}`));
  }
  if (plan.studioOnly.length) {
    console.log(`\n  Sold on the website but NOT Sold in the workbook (${plan.studioOnly.length}) — left as they are`);
    console.log('  (back in stock? set its workbook row\'s Website to R or Y and step 4 puts it back on sale):');
    plan.studioOnly.forEach((x) => console.log(`    ${x.listing.name}  (${x.listing.gradenumber})${x.needsDate ? `  — gets today's date (${x.soldDate}) for the archive` : ''}`));
  }
  const soldChanges = [...plan.markSold, ...plan.fixDate, ...undated, ...plan.relist];
  if (!soldChanges.length) console.log('  Every coin sold in the workbook is marked sold on the website, with its sale date.');
  const total = soldChanges.length + check.price.length;
  if (!total) {
    console.log('\n  Website is up to date with the workbook.');
    return;
  }

  const soldOnly = soldChanges.length - plan.relist.length;
  const what = [check.price.length && `${check.price.length} price(s)`, soldOnly && `${soldOnly} sold coin(s)`, plan.relist.length && `${plan.relist.length} back-in-stock coin(s)`]
    .filter(Boolean).join(' and ');
  if (ASK && !APPLY) APPLY = await askYes(`\nUpdate ${what} on the website and rebuild the site? (y/N) `);
  if (!APPLY) { console.log('  Nothing changed.'); return; }

  const tx = client.transaction();
  for (const x of check.price) {
    tx.patch(x.listing._id, (p) => p.set({ price: x.to }));
    if (drafts.has(`drafts.${x.listing._id}`)) tx.patch(`drafts.${x.listing._id}`, (p) => p.set({ price: x.to }));
  }
  for (const x of plan.markSold) tx.patch(x.listing._id, (p) => p.set({ sold: true, soldDate: x.soldDate }));
  for (const x of [...plan.fixDate, ...undated]) tx.patch(x.listing._id, (p) => p.set({ soldDate: x.soldDate }));
  for (const x of plan.relist) {
    const back = (p) => p.set({ sold: false, ...(x.price ? { price: x.price } : {}) }).unset(['soldDate']);
    tx.patch(x.listing._id, back);
    if (drafts.has(`drafts.${x.listing._id}`)) tx.patch(`drafts.${x.listing._id}`, back);   // so publishing a draft doesn't re-sell it
  }
  await tx.commit();
  console.log(`  ✔ Updated ${what}.`);
  await startBuild();
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(`\n  ERROR: ${e.message}`); process.exitCode = 1; });
}
