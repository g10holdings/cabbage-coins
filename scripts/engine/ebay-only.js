/**
 * eBay-ONLY coins: Website column "E" in the workbook (Tony, 2026-11-17; first ones: six 2026 Trump $1 July 4 Privy
 * NGC MS66). They never touch the website, Sanity or the CAC marketplace. Everything comes from two places:
 *   - the workbook row (read only): name, grade, grading company, cert #, listPrice, Status
 *   - the photo folder 1_Prep-Photos made (waiting_website\<name>-<cert>): -1..-4.jpg (an ingot's -1/-2)
 *
 * A listing is built exactly like ebay-sync.js builds a website coin's (same price formula on listPrice, free
 * shipping, category rules, graded-coin fields, Tony's standard text, no returns, offers off), except:
 *   - the photos are uploaded straight to eBay (eBay Picture Services) from the folder: slab shots first, then the
 *     close-ups, then the promo card (also copied to eBay, since eBay won't mix its own pictures with outside ones);
 *   - when more than one eBay-only coin has the same name (the 6 Trumps), the cert # goes on the end of the title, so
 *     eBay doesn't take them for duplicate listings and buyers can tell them apart.
 *
 * One run:
 *   + new: "E" + Active in the workbook, photos ready, not on eBay yet -> listed; its photo folder then moves to
 *     doneUnsold and the camera shots (originals\) are deleted, as step 4 does for website coins.
 *   ~ listPrice changed -> the eBay price is updated.
 *   − Sold in the workbook -> the eBay listing is ended (step 4's photo filing then moves the folder to doneSOLD).
 *   $ sold ON eBay -> named, so Tony marks it Sold in the workbook.
 *   ! ended on eBay by hand, still Active in the workbook -> listed again only if Tony says so.
 * Matching is by the cert # eBay holds on the listing. What this script listed is remembered in
 * engine/.ebay-only-ledger.json (cert -> eBay item #), only to tell "sold/ended on eBay" from "never listed".
 * ebay-sync.js (step 4) leaves every "E" coin's listing alone.
 *
 *   node ebay-only.js           preview: changes nothing (new listings are checked with eBay's VerifyAddFixedPriceItem)
 *   node ebay-only.js --ask     preview, then ask (Extras\eBay-Only)
 *   node ebay-only.js --send    do it without asking
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import dotenv from 'dotenv';
import { readInventory, listingFromRow, certKey, hasCert } from './workbook.js';
import { photoFolders, splitCert } from './listing-photos.js';
import { workbookSales } from './sold.js';
import { settings } from './settings.js';
import { askYes } from './ask.js';
import {
  ebayPrice, shippingFor, accessToken, trading, tag, esc, liveListings, itemInfo, categoryFor, categoryName,
  conditionXml, specifics, shippingXml, pictureXml, feesOf, STANDARD_TEXT, RETURN_POLICY, PROMO_IMAGE,
} from './ebay-sync.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const LEDGER = path.join(__dirname, '.ebay-only-ledger.json');
const money = (n) => `$${Number(n).toLocaleString()}`;

/** The workbook's eBay-only coins, one per cert # (a later "_2" row is the same coin back in stock). */
export function ebayOnlyCoins(rows) {
  const soldInWorkbook = workbookSales(rows);
  const byCert = new Map();
  const noCert = [];
  for (const r of rows) {
    if (!/^e$/i.test(String(r.Website ?? '').trim())) continue;
    const w = listingFromRow(r);
    if (!hasCert(r.inventoryID)) { noCert.push(w.name); continue; }
    byCert.set(w.key, {
      cert: w.cert, key: w.key, name: w.name, price: w.price, grade: w.grade, gradenumber: w.cert,
      gradingCompany: w.gradingCompany,
      // workbook.js calls anything not gold/copper "Silver"; a clad coin (Type2 "Clad ...") has no Composition on eBay
      category: /clad/i.test(String(r.Type2 ?? '')) ? 'Clad' : w.category,
      type2: String(r.Type2 ?? ''),
      sold: soldInWorkbook({ gradenumber: w.cert, name: w.name }),
    });
  }
  const coins = [...byCert.values()];
  // Same name more than once (and for sale): the cert # goes on the title, so the listings differ.
  const count = new Map();
  for (const c of coins.filter((x) => !x.sold)) count.set(c.name, (count.get(c.name) ?? 0) + 1);
  for (const c of coins) c.title = titleFor(c.name, c.cert, count.get(c.name) > 1);
  return { coins, noCert };
}

export function titleFor(name, cert, withCert) {
  const tail = withCert ? ` #${cert}` : '';
  return name.slice(0, 80 - tail.length).trim() + tail;
}

/** The coin's photo folder (waiting_website first, then doneUnsold) and its photos in eBay order: slabs first. */
export function photosOf(cert, roots = [settings.photos.inProgress, settings.photos.listed]) {
  for (const root of roots) {
    const folder = photoFolders(root).find((f) => splitCert(f, cert) != null);
    if (!folder) continue;
    const dir = path.join(root, folder);
    const base = splitCert(folder, cert);
    const has = (n) => fs.existsSync(path.join(dir, `${base}-${n}.jpg`));
    // -1 obverse slab, -3 reverse slab, -2 / -4 close-ups; an ingot: -1 front, -2 back (+ -3/-4, 2nd front/back)
    const order = has(1) && has(2) && !has(3) && !has(4) ? [1, 2] : [1, 3, 2, 4];
    const files = order.map((n) => path.join(dir, `${base}-${n}.jpg`));
    return { root, folder, dir, files, ready: files.every((f) => fs.existsSync(f)) };
  }
  return null;
}

// Photos go to eBay's own picture host through the Media API (the Trading API's UploadSiteHostedPictures answers
// "Resource not found" as of 2026-11-17). A picture not used in a listing within 30 days is dropped by eBay.
const MEDIA = 'https://apim.ebay.com/commerce/media/v1_beta/image';
async function media(how, body, headers = {}) {
  const res = await fetch(`${MEDIA}/${how}`, { method: 'POST', headers: { Authorization: `Bearer ${await accessToken()}`, ...headers }, body });
  const text = await res.text();
  const url = res.ok ? JSON.parse(text).imageUrl : null;
  if (!url) throw new Error(`eBay's picture host said ${res.status}: ${text.slice(0, 300)}`);
  return url;
}

/** One photo from the folder onto eBay. Returns its eBay (i.ebayimg.com) address. */
export async function uploadPhoto(file) {
  const form = new FormData();
  form.append('image', new Blob([fs.readFileSync(file)], { type: 'image/jpeg' }), path.basename(file));
  return media('create_image_from_file', form).catch((err) => { throw new Error(`${path.basename(file)}: ${err.message}`); });
}

let promoOnEbay;
/** The promo card, copied from the website onto eBay (eBay won't mix its own pictures with outside ones). */
export async function promoCard() {
  promoOnEbay ??= await media('create_image_from_url', JSON.stringify({ imageUrl: PROMO_IMAGE }), { 'Content-Type': 'application/json' })
    .catch((err) => { throw new Error(`promo card: ${err.message}`); });
  return promoOnEbay;
}

/** The AddFixedPriceItem <Item>. `photos` = picture addresses (for the preview, just the promo card). */
export async function itemXml(coin, photos) {
  const cat = await categoryFor(coin);
  const description = `<div>${esc(coin.title)}</div><div><br></div><div>${STANDARD_TEXT}</div>`;
  const xml = `<Item><Title>${esc(coin.title)}</Title>`
    + `<Description><![CDATA[${description}]]></Description>`
    + `<PrimaryCategory><CategoryID>${cat.id ?? ''}</CategoryID></PrimaryCategory>`
    + `<Storefront><StoreCategoryID>1</StoreCategoryID></Storefront>`
    + `<StartPrice currencyID="USD">${ebayPrice(coin.price)}</StartPrice><Quantity>1</Quantity>`
    + `<ListingType>FixedPriceItem</ListingType><ListingDuration>GTC</ListingDuration>`
    + `<Country>US</Country><Currency>USD</Currency><Location>Lancaster, Pennsylvania</Location><PostalCode>17602</PostalCode>`
    + `<DispatchTimeMax>2</DispatchTimeMax>`
    + (cat.id ? await conditionXml(cat.id, coin) : '')
    + `<ItemSpecifics>${specifics(coin)}</ItemSpecifics>`
    + pictureXml(photos)
    + RETURN_POLICY
    + shippingXml(coin)
    + `<BestOfferDetails><BestOfferEnabled>false</BestOfferEnabled></BestOfferDetails>`
    + `<InventoryTrackingMethod>ItemID</InventoryTrackingMethod>`
    + `</Item>`;
  return { xml, cat };
}

/** A listed coin's folder: waiting_website -> doneUnsold, camera shots deleted (step 4's rule for website coins). */
function fileFolder(p) {
  if (p.photos.root !== settings.photos.inProgress) return null;
  const to = path.join(settings.photos.listed, p.photos.folder);
  if (fs.existsSync(to)) return `photo folder not moved: "${p.photos.folder}" is already in doneUnsold`;
  for (const f of fs.readdirSync(p.photos.dir)) if (f === 'originals' || /^DSC.*\.jpe?g$/i.test(f)) fs.rmSync(path.join(p.photos.dir, f), { recursive: true, force: true });
  fs.renameSync(p.photos.dir, to);
  return null;
}

const readLedger = () => (fs.existsSync(LEDGER) ? JSON.parse(fs.readFileSync(LEDGER, 'utf8')) : {});

async function main() {
  const args = process.argv.slice(2);
  let SEND = args.includes('--send');
  const ASK = args.includes('--ask');

  const { rows } = readInventory(undefined, ['inventoryID', 'Type', 'Type2', 'itemDescription', 'Certification', 'CAC', 'PCGS Num', 'Website', 'Status', 'listPrice']);
  const { coins, noCert } = ebayOnlyCoins(rows);
  console.log(`eBay-only coins (Website "E" in the workbook): ${coins.filter((c) => !c.sold).length} for sale, ${coins.filter((c) => c.sold).length} sold\n`);
  if (!coins.length && !noCert.length) { console.log('Nothing to do: no workbook row has "E" in the Website column.'); return; }

  const ledger = readLedger();
  console.log('Reading your eBay listings (takes a minute)...');
  const live = await liveListings();
  const liveByCert = new Map(live.filter((l) => l.cert).map((l) => [certKey(l.cert), l]));

  const plan = { add: [], revise: [], end: [], soldOnEbay: [], relist: [], noPhotos: [], noPrice: [], unchanged: [], forget: [] };
  for (const c of coins) {
    const l = liveByCert.get(c.key);
    const target = { price: c.price > 0 ? ebayPrice(c.price) : null, ship: c.price > 0 ? shippingFor(c.price) : null };
    if (c.sold) {
      if (l && l.sold === 0) plan.end.push({ coin: c, item: l });
      else if (!l && ledger[c.key]) plan.forget.push(c.key);
      continue;
    }
    if (l) {
      if (l.sold > 0) plan.soldOnEbay.push({ coin: c, item: l });
      else if (!target.price) plan.noPrice.push({ coin: c });
      else if (l.price !== target.price || l.shipService !== target.ship.service) plan.revise.push({ coin: c, item: l, target });
      else plan.unchanged.push({ coin: c, item: l });
      continue;
    }
    if (!target.price) { plan.noPrice.push({ coin: c }); continue; }
    const photos = photosOf(c.cert);
    if (!photos?.ready) { plan.noPhotos.push({ coin: c, photos }); continue; }
    if (ledger[c.key]) {   // listed by this script before, gone from eBay now: sold there, or ended by hand
      const info = await itemInfo(ledger[c.key].itemId);
      if (info.sold > 0) { plan.soldOnEbay.push({ coin: c, item: info }); continue; }
      plan.relist.push({ coin: c, target, photos });
      continue;
    }
    plan.add.push({ coin: c, target, photos });
  }

  // Preview: eBay validates each new listing (with the promo card standing in for the photos; nothing is uploaded).
  if (!SEND) {
    for (const p of [...plan.add, ...plan.relist]) {
      const built = await itemXml(p.coin, [PROMO_IMAGE]);
      p.cat = built.cat; p.catName = await categoryName(built.cat.id);
      const v = await trading('VerifyAddFixedPriceItem', built.xml);
      p.verify = { errors: v.errors.filter((e) => e.severity === 'Error').map((e) => e.message), warnings: v.errors.filter((e) => e.severity === 'Warning').map((e) => e.message), fees: feesOf(v.xml) };
    }
  }

  const line = (p) => `${money(p.coin.price).padStart(7)} workbook → ${money(p.target.price).padStart(7)} eBay, ${p.target.ship.label}  ${p.coin.title}`;
  console.log(`\neBay-only: ${SEND ? 'SENDING' : 'PREVIEW, nothing is changed'}\n`);
  console.log(`+ New listings: ${plan.add.length}`);
  for (const p of plan.add) {
    console.log(`  ${line(p)}`);
    if (p.catName) console.log(`        category: ${p.catName} (${p.cat.how})  ·  ${p.photos.files.length} photos + promo card, from ${p.photos.folder}`);
    if (p.verify) {
      if (p.verify.errors.length) console.log(`        ✗ eBay would refuse it: ${p.verify.errors.join(' | ')}`);
      else console.log(`        ✓ eBay accepts it${p.verify.fees.length ? ` (listing fees: ${p.verify.fees.map((f) => `${f.name} $${f.amount}`).join(', ')})` : ', no listing fee'}`);
      for (const w of p.verify.warnings) console.log(`        ⚠ ${w}`);
    }
  }
  if (plan.add.length) console.log('  After listing, each photo folder moves to doneUnsold and its camera shots (originals) are deleted.');
  console.log(`\n~ Price or shipping to update (listPrice changed): ${plan.revise.length}`);
  for (const p of plan.revise) console.log(`  ${line(p)}   (now ${money(p.item.price)})`);
  console.log(`\n− Sold in the workbook, to end on eBay: ${plan.end.length}`);
  for (const p of plan.end) console.log(`  ${p.coin.title}`);
  if (plan.soldOnEbay.length) {
    console.log(`\n$ SOLD ON EBAY — mark these Sold in the workbook: ${plan.soldOnEbay.length}`);
    for (const p of plan.soldOnEbay) console.log(`  ${p.coin.name} (cert ${p.coin.cert})`);
  }
  if (plan.relist.length) {
    console.log(`\n! Ended on eBay by hand, but still Active in the workbook: ${plan.relist.length}`);
    for (const p of plan.relist) console.log(`  ${line(p)}`);
    console.log('  If it sold, mark it Sold in the workbook. If not, you\'ll be asked below whether to list it again.');
  }
  if (plan.noPhotos.length) {
    console.log(`\n· Waiting for photos (run 1_Prep-Photos; the folder name must end with the cert #): ${plan.noPhotos.length}`);
    for (const p of plan.noPhotos) console.log(`  ${p.coin.name} (cert ${p.coin.cert})${p.photos ? `: ${p.photos.folder} doesn't have its photos yet` : ': no photo folder'}`);
  }
  if (plan.noPrice.length) {
    console.log(`\n· No listPrice in the workbook (skipped): ${plan.noPrice.length}`);
    for (const p of plan.noPrice) console.log(`  ${p.coin.name} (cert ${p.coin.cert})`);
  }
  if (noCert.length) console.log(`\n· "E" rows with no cert # (eBay-only needs one; list these by hand): ${noCert.join('; ')}`);
  console.log(`\n= Unchanged on eBay: ${plan.unchanged.length}`);

  const work = [plan.add.length && `list ${plan.add.length}`, plan.revise.length && `update ${plan.revise.length}`, plan.end.length && `end ${plan.end.length}`].filter(Boolean);
  if (!SEND) {
    if (ASK && work.length && await askYes(`\neBay: ${work.join(', ')}. Go ahead? (y/N) `)) SEND = true;
    else if (!(ASK && plan.relist.length)) { console.log(work.length ? '\nNothing was changed on eBay.' : '\nNothing to change on eBay.'); return; }
    else { if (work.length) console.log('\nNone of that will be changed on eBay.'); plan.add = []; plan.revise = []; plan.end = []; }
  }
  if (plan.relist.length && ASK && await askYes(`\neBay: list the ${plan.relist.length} coin(s) you ended by hand again? (y/N) `)) plan.add.push(...plan.relist);
  if (![plan.add, plan.revise, plan.end, plan.forget].some((x) => x.length)) { console.log('\nNothing was changed on eBay.'); return; }

  const now = new Date().toISOString();
  const failed = [], notes = [];
  const save = () => fs.writeFileSync(LEDGER, JSON.stringify(ledger, null, 2));
  for (const p of plan.add) {
    try {
      process.stdout.write(`  listing ${p.coin.title} ... `);
      const urls = [];
      for (const f of p.photos.files) urls.push(await uploadPhoto(f));
      urls.push(await promoCard());
      const { xml } = await itemXml(p.coin, urls);
      const r = await trading('AddFixedPriceItem', xml);
      if (!r.ok) throw new Error(r.errors.filter((e) => e.severity === 'Error').map((e) => e.message).join('; '));
      const itemId = tag(r.xml, 'ItemID');
      ledger[p.coin.key] = { itemId, price: p.target.price, title: p.coin.title, sentAt: now };
      save();
      console.log(`✓ https://www.ebay.com/itm/${itemId}`);
      const note = fileFolder(p);
      if (note) notes.push(`${p.coin.title}: ${note}`);
    } catch (err) { console.log('✗'); failed.push(`${p.coin.title}: ${err.message}`); }
  }
  for (const p of plan.revise) {
    const r = await trading('ReviseFixedPriceItem', `<Item><ItemID>${p.item.id}</ItemID><StartPrice currencyID="USD">${p.target.price}</StartPrice>${shippingXml(p.coin)}${RETURN_POLICY}</Item>`);
    if (r.ok) { ledger[p.coin.key] = { ...(ledger[p.coin.key] ?? { itemId: p.item.id, title: p.coin.title }), price: p.target.price, sentAt: now }; save(); }
    else failed.push(`${p.coin.title}: ${r.errors.map((e) => e.message).join('; ')}`);
  }
  for (const p of plan.end) {
    const r = await trading('EndFixedPriceItem', `<ItemID>${p.item.id}</ItemID><EndingReason>NotAvailable</EndingReason>`);
    if (r.ok || /already been closed/i.test(r.errors.map((e) => e.message).join(' '))) { delete ledger[p.coin.key]; save(); }
    else failed.push(`${p.coin.title}: ${r.errors.map((e) => e.message).join('; ')}`);
  }
  for (const k of plan.forget) delete ledger[k];
  save();
  console.log(`\nDone: ${plan.add.length + plan.revise.length + plan.end.length - failed.length} change(s) made on eBay.`);
  for (const n of notes) console.log(`  note: ${n}`);
  if (failed.length) { console.log(`✗ ${failed.length} failed (they'll be tried again next run):`); for (const f of failed) console.log(`  ${f}`); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => { console.error(`\n✗ ${err.message}`); process.exitCode = 1; });
}
