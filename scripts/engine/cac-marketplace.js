/**
 * Keep Tony's coins on CAC's marketplace in step with the website.
 *
 * One run = one POST /marketplace with the whole feed:
 *   - every unsold graded listing (new ones get added, changed ones updated: CAC matches on sellerId,
 *     which is the Sanity listing id, so sending a coin again never duplicates it);
 *   - nothing else: the feed REPLACES what's on CAC, so a coin that sold, was deleted or stopped
 *     qualifying is taken down simply by leaving it out.
 *
 * Learned on the first sale (2026-10-17): CAC rejects quantity 0 ("`quantity` can't be less than 1"),
 * yet both sold coins vanished from the marketplace, and the answer counted them under "deleted"
 * (only 1 of the 2, so that count isn't exact). The ledger still lists what was sent, so take-downs
 * show in the preview and a run can refuse to wipe many coins at once.
 *
 * What has been sent is remembered in Sanity (document "cac-marketplace-ledger"), not on this
 * computer, so a sold coin can still be taken down after its listing is deleted.
 *
 * Usage:
 *   node cac-marketplace.js                Preview: what would be added, updated, removed. Sends nothing.
 *   node cac-marketplace.js --send         Send it to CAC.
 *   node cac-marketplace.js --ask          Preview, then ask before sending (4_After-Publishing-or-Selling).
 *   node cac-marketplace.js --cac-only     Only CAC-stickered and CACG coins (works with --send too).
 *   --allow-mass-removal                   Needed with --send when a run would take down more than 10 coins at once
 *                                          (with --ask it warns and asks instead).
 * A coin counts as sold when the workbook says Sold or the website's Sold box is ticked (sold.js).
 *
 * Env (scripts/engine/.env): SANITY_WRITE_TOKEN; CAC_API_KEY and CAC_API_TOKEN for --send.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { createClient } from '@sanity/client';
import slugify from 'slugify';
import { slabsFirst } from './photo-order.js';
import { askYes } from './ask.js';
import { settings } from './settings.js';
import { workbookSales } from './sold.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const args = process.argv.slice(2);
let SEND = args.includes('--send');
const ASK = args.includes('--ask');   // preview, then ask before sending (4_After-Publishing-or-Selling)
const CAC_ONLY = args.includes('--cac-only');
const ALLOW_MASS_REMOVAL = args.includes('--allow-mass-removal');
const MASS_REMOVAL = 10;
const SITE = 'https://cabbagecoins.com';
const PROJECT = settings.sanity.projectId;
const API = process.env.CAC_MARKETPLACE_URL || 'https://api.cacgrading.com/marketplace';   // overridable for testing
const LEDGER_ID = 'cac-marketplace-ledger';
const OUT_FILE = path.join(__dirname, 'cac-marketplace-preview.json');

// CAC's marketplace knows these grading services; Tony's data says "CACG" for CAC's own holders.
const SERVICE = { PCGS: 'PCGS', NGC: 'NGC', CACG: 'CAC' };

// "image-<hash>-1044x1044-jpg" -> the original file on Sanity's CDN (CAC gets the full master, untouched).
const imageUrl = (ref) => {
  const m = /^image-([a-f0-9]+)-(\d+x\d+)-(\w+)$/.exec(ref ?? '');
  return m ? `https://cdn.sanity.io/images/${PROJECT}/${settings.sanity.dataset}/${m[1]}-${m[2]}.${m[3]}` : null;
};
// "MS66 CAC" -> "MS66", "PR65 CAM CAC" -> "PR65CAM", "VG08" -> "VG8": CAC wants the grade alone, written like
// its examples (it rejects the leading zero: "Invalid `grade`").
const gradeOf = (g) => String(g ?? '').replace(/\b(CAC|OGH|CACG)\b/g, '').replace(/\s+/g, ' ').trim()
  .replace(/^([A-Z]+\d+\+?) (?=[A-Z]+$)/, '$1')
  .replace(/^([A-Z]+)0(?=\d)/, '$1');
const certOf = (n) => String(n ?? '').trim().replace(/_\d+$/, '').replace(/\D/g, '');
// The page's URL, made exactly the way the site's "slug" filter makes it (web/.eleventy.js): keep the two in step.
const pageSlug = (s) => slugify(s.replace('.', '-'), { replacement: '-', remove: /[&,+()$~%.'":*?<>{}]/g, lower: true })
  .replace('dollar', 'usd');
const money = (n) => `$${Number(n).toLocaleString()}`;

/** The feed: one item per unsold listing CAC can take, plus why the others were left out. */
async function buildFeed(client) {
  const soldInWorkbook = workbookSales();
  const all = await client.fetch(
    `*[_type == "listing" && sold != true && !(_id in path("drafts.**"))] | order(price desc)
      {_id, name, slug, grade, gradenumber, gradingCompany, cac, price, pcgsCatalogNumber, image, imagesGallery}`,
  );
  const listings = all.filter((l) => !soldInWorkbook(l));   // Sold in the workbook counts even before the site's box is ticked
  const items = [];
  const skipped = [];
  for (const l of listings) {
    const service = SERVICE[l.gradingCompany];
    const why =
      !service ? `grading company "${l.gradingCompany ?? '—'}" isn't one CAC lists` :
      CAC_ONLY && !l.cac && l.gradingCompany !== 'CACG' ? 'not CAC' :
      !l.pcgsCatalogNumber ? 'no PCGS catalog #' :
      !l.price ? 'no price' :
      !l.slug?.current ? 'no slug' :
      !l.image?.asset?._ref ? 'no main photo' : null;
    if (why) { skipped.push({ name: l.name, why }); continue; }

    // Slab shots first, then the close-ups (photo-order.js); CAC takes 4.
    const photos = (await slabsFirst([l.image, ...(l.imagesGallery ?? [])]
      .map((i) => imageUrl(i?.asset?._ref)).filter(Boolean)
      .filter((u, i, all) => all.indexOf(u) === i))).slice(0, 4);
    items.push({
      sellerId: l._id,
      gradingService: service,
      cert: certOf(l.gradenumber),
      title: l.name,
      pcgsId: String(l.pcgsCatalogNumber),
      grade: gradeOf(l.grade),
      price: l.price,
      quantity: 1,
      listingUrl: `${SITE}/listings/${pageSlug(l.slug.current)}/`,
      imageUrl: photos[0],
      ...(photos[1] && { imageUrl2: photos[1] }),
      ...(photos[2] && { imageUrl3: photos[2] }),
      ...(photos[3] && { imageUrl4: photos[3] }),
    });
  }
  return { items, skipped };
}

/** What's on CAC, as far as we know: sellerId -> {item (as last sent), sentAt}. */
async function loadLedger(client) {
  const doc = await client.getDocument(LEDGER_ID);
  return doc?.entries ? JSON.parse(doc.entries) : {};
}
async function saveLedger(client, ledger) {
  await client.createOrReplace({
    _id: LEDGER_ID,
    _type: 'cacMarketplaceLedger',
    note: 'What scripts/engine/cac-marketplace.js has sent to the CAC marketplace. Do not edit by hand.',
    entries: JSON.stringify(ledger),
  });
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

async function main() {
  const { SANITY_WRITE_TOKEN, CAC_API_KEY, CAC_API_TOKEN } = process.env;
  if (!SANITY_WRITE_TOKEN) throw new Error('SANITY_WRITE_TOKEN is missing from scripts/engine/.env');
  if ((SEND || ASK) && (!CAC_API_KEY || !CAC_API_TOKEN)) throw new Error('CAC_API_KEY / CAC_API_TOKEN are missing from scripts/engine/.env');
  const client = createClient({ projectId: PROJECT, dataset: settings.sanity.dataset, apiVersion: settings.sanity.apiVersion, token: SANITY_WRITE_TOKEN, useCdn: false });

  const [{ items, skipped }, ledger] = await Promise.all([buildFeed(client), loadLedger(client)]);
  const inFeed = new Set(items.map((i) => i.sellerId));
  const added = items.filter((i) => !ledger[i.sellerId]);
  const changed = items.filter((i) => ledger[i.sellerId] && !same(ledger[i.sellerId].item, i));
  const removals = Object.entries(ledger).filter(([id]) => !inFeed.has(id)).map(([, e]) => e.item);
  const feed = items;   // leaving a coin out is what takes it down

  console.log(`CAC marketplace${CAC_ONLY ? ' (CAC coins only)' : ''}: ${SEND ? 'SENDING' : 'PREVIEW, nothing is sent'}\n`);
  console.log(`  On the website and going to CAC:  ${items.length}`);
  console.log(`    new to CAC:                     ${added.length}`);
  console.log(`    changed since last send:        ${changed.length}`);
  console.log(`  To take down (sold or gone):      ${removals.length}\n`);
  for (const i of added) console.log(`  + ${money(i.price).padStart(8)}  ${i.title}`);
  for (const i of changed) {
    const was = ledger[i.sellerId].item;
    const what = Object.keys(i).filter((k) => !same(i[k], was[k])).map((k) => (k === 'price' ? `price ${money(was.price)} → ${money(i.price)}` : k));
    console.log(`  ~ ${money(i.price).padStart(8)}  ${i.title}  (${what.join(', ')})`);
  }
  for (const i of removals) console.log(`  − ${money(i.price).padStart(8)}  ${i.title}`);
  if (skipped.length) {
    console.log(`\n  Not sent (${skipped.length}):`);
    for (const s of skipped) console.log(`    - ${s.name}: ${s.why}`);
  }
  fs.writeFileSync(OUT_FILE, JSON.stringify(feed, null, 2));

  // Many take-downs at once could mean a bad read rather than a busy week: asked about plainly, never done unasked.
  const mass = removals.length > MASS_REMOVAL && !ALLOW_MASS_REMOVAL;
  if (mass && !ASK) {
    throw new Error(`This would take down ${removals.length} coins at once. If that's right, run again with --allow-mass-removal.`);
  }
  if (mass) console.log(`\n⚠ That's ${removals.length} coins coming down at once, more than usual. Check the − list above: are they all sold?`);
  const work = [added.length && `add ${added.length}`, changed.length && `update ${changed.length}`, removals.length && `take down ${removals.length}`].filter(Boolean);
  if (!SEND) {
    if (ASK && work.length && await askYes(`\nCAC: ${work.join(', ')}${mass ? ' (all those take-downs are right)' : ''}. Send? (y/N) `)) SEND = true;
    else {
      console.log(!work.length ? '\nNothing to change on CAC.' : ASK ? '\nNothing was sent to CAC.'
        : `\nNothing was sent. To send it, run: node cac-marketplace.js --send${CAC_ONLY ? ' --cac-only' : ''}`);
      return;
    }
  }
  // An empty feed would take every coin off CAC.
  if (!feed.length) throw new Error('No coins to send, which would take everything off CAC. Nothing was sent.');

  const res = await fetch(API, {
    method: 'POST',
    headers: { 'X-API-KEY': CAC_API_KEY, 'X-API-TOKEN': CAC_API_TOKEN, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(feed),
  });
  const text = await res.text();
  fs.writeFileSync(path.join(__dirname, 'cac-marketplace-last-response.json'), text);
  // 429 is either the daily limit or "too rapid": CAC allows only one marketplace upload per set period.
  if (res.status === 429) {
    const wait = res.headers.get('retry-after');
    throw new Error(`CAC says too many requests${text ? ` ("${text.slice(0, 200)}")` : ''}${wait ? `, retry after ${wait}s` : ''}. `
      + 'Nothing changed on our side; wait a while (it may be a cooldown between uploads) and run it again.');
  }
  if (res.status === 401) throw new Error('CAC refused the key (401). Check CAC_API_KEY / CAC_API_TOKEN in engine\\.env.');
  if (!res.ok) throw new Error(`CAC answered ${res.status}: ${text.slice(0, 400)}`);
  let body;
  try { body = JSON.parse(text); } catch { throw new Error(`CAC's answer wasn't JSON: ${text.slice(0, 400)}`); }
  const r = body?.data?.results ?? body?.results ?? {};
  const errorItems = body?.data?.errorItems ?? body?.errorItems ?? [];
  const failed = new Map(errorItems.map((e) => [e.sellerId, e.error ?? 'error']));

  console.log(`\nCAC: ${r.inserted ?? '?'} added, ${r.updated ?? '?'} updated, ${r.deleted ?? '?'} deleted, ${r.errors ?? errorItems.length} with errors.`);
  for (const [id, err] of failed) console.log(`  ✗ ${feed.find((f) => f.sellerId === id)?.title ?? id}: ${err}`);

  const now = new Date().toISOString();
  for (const i of items) if (!failed.has(i.sellerId)) ledger[i.sellerId] = { item: i, sentAt: now };
  for (const i of removals) delete ledger[i.sellerId];
  await saveLedger(client, ledger);

  if (removals.length && !(Number(r.deleted) > 0)) {
    console.log(`\n⚠ CAC reported 0 deleted, but ${removals.length} coin(s) were left out to take them down. Please check`);
    console.log('  that these are gone from CAC\'s marketplace, and delete them there by hand if not:');
    for (const i of removals) console.log(`    - ${i.title}`);
  }
  console.log('\nDone. CAC\'s full answer is in engine\\cac-marketplace-last-response.json.');
}

main().catch((err) => {
  console.error(`\n✗ ${err.message}`);
  process.exitCode = 1;
});
