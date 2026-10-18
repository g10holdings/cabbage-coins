/**
 * Creates DRAFT coin listings in Sanity from the workbook, then puts each one's photos on it.
 *
 * It reads the business workbook's "inventory" sheet, READ-ONLY (workbook.js), and takes every coin marked
 * Website = R (ready to list; Tony changes it to Y himself once the listing is live) that is Active and has no
 * listing yet. Grade, dates, denomination and category are worked out from the row; check them in the preview.
 * Each listing gets its Alternative Text from the known-design table (coin-designs.js). A coin whose series
 * isn't in the table gets NO alt text and a warning naming it, so Tony writes that one in the Studio. Nothing
 * guesses. The drafts land unpublished, for Tony's description.
 *
 * Then it puts the 4 photos made by 1_Prep-Photos on every draft that has none yet, finding them by cert #
 * (listing-photos.js). A coin whose photos aren't ready gets them on a later run.
 *
 * Usage:
 *   node import-listings.js              preview, then asks before writing anything
 *   node import-listings.js --dry-run    preview only
 *   node import-listings.js --yes        no question (unattended)
 *   node import-listings.js --delete     Undo-Import: deletes the drafts this made (asks first)
 *   node import-listings.js --limit 3    only the first 3 coins
 *
 * Exit code 3 means Tony answered no (the launcher then skips the PCGS step).
 * Env: SANITY_WRITE_TOKEN in .env; paths and project in settings.json.
 */

import process from 'node:process';
import readline from 'node:readline/promises';
import { pathToFileURL } from 'node:url';
import { lookupDesign } from './coin-designs.js';
import { readInventory, certKey, nameKey, hasCert, listingFromRow } from './workbook.js';
import { photoFolders, findPhotos, putPhotos, photoStatus } from './listing-photos.js';
import { settings, sanity } from './settings.js';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const DELETE = args.includes('--delete');
const YES = args.includes('--yes');
const limitIdx = args.indexOf('--limit');
const LIMIT = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : Infinity;

const warnings = [];
const warn = (msg) => warnings.push(msg);

/** A URL-safe token from the name, for the internal draft id (the visible slug is generated in the Studio). */
function slugify(name) {
  return String(name)
    .toLowerCase()
    .replace(/\$/g, 'usd')
    .replace(/\bdollars?\b/g, 'usd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96)
    .replace(/-+$/g, '');
}

async function confirm(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question(question)).trim().toLowerCase();
  rl.close();
  return answer === 'y' || answer === 'yes';
}

/** Simple concurrency-limited async map. */
async function mapPool(items, limit, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const idx = i++; await fn(items[idx], idx); }
  }));
}

/** One workbook listing (workbook.js listingFromRow) -> a Sanity draft. Caption and description stay blank. */
export function buildDoc(w, usedSlugs) {
  let idBase = slugify(w.name);
  if (usedSlugs.has(idBase)) {
    let n = 2;
    while (usedSlugs.has(`${idBase}-${n}`)) n++;
    idBase = `${idBase}-${n}`;
  }
  usedSlugs.add(idBase);

  const doc = { _id: `drafts.${idBase}`, _type: 'listing', name: w.name, sold: false, featured: false, cac: /\bCAC\b/i.test(w.grade) };
  if (w.date != null && w.date !== '') doc.date = String(w.date);
  if (w.dateShown) doc.dateshown = w.dateShown;
  if (w.grade) doc.grade = w.grade;
  if (w.cert && w.cert !== 'N/A') doc.gradenumber = w.cert;
  if (w.price != null) doc.price = w.price;
  doc.gradingCompany = w.gradingCompany;
  // "97199/7199" = designation # (shown on the listing) / catalog # (sorting); one number = catalog # only.
  if (w.pcgsCatalogNumber) doc.pcgsCatalogNumber = w.pcgsCatalogNumber;
  if (w.pcgsPopNumber && w.pcgsPopNumber !== w.pcgsCatalogNumber) doc.pcgsDesignationNumber = w.pcgsPopNumber;
  if (w.category) doc.category = w.category;
  // Alternative Text from the known-design table only (exact by series); blank + a warning otherwise.
  const known = lookupDesign(w.name, w.denomination);
  if (known) doc.image = { _type: 'mainImage', alt: known };
  else warn(`${w.name}: no match in coin-designs.js (series not listed, or the name and date disagree) — alt text left BLANK, write it in the Studio.`);
  for (const f of w.flags) warn(`${w.name}: ${f}`);
  return doc;
}

/**
 * The workbook's coins that should become listings: Website = R, Active, and no listing (published or draft)
 * with that cert # yet (or that name, for items with no cert). For --delete (Undo-Import): the ones whose only
 * listing is a draft.
 */
async function dueFromWorkbook(client) {
  const { rows, file, savedAt } = readInventory();
  const listings = await client.fetch(`*[_type == "listing"${DELETE ? ' && !(_id in path("drafts.**"))' : ''}]{name, gradenumber}`);
  const keys = new Set(listings.filter((l) => hasCert(l.gradenumber)).map((l) => certKey(l.gradenumber)));
  const names = new Set(listings.map((l) => nameKey(l.name)));
  const due = rows.map(listingFromRow).filter((w) => w.website === 'R' && w.status === 'Active' && w.key && !keys.has(w.key) && !names.has(nameKey(w.name)));
  console.log(`Workbook: ${file} (saved ${savedAt.toLocaleString()}; opened read-only)`);
  console.log(`Project ${settings.sanity.projectId} / dataset ${settings.sanity.dataset}${DRY_RUN ? '  [PREVIEW ONLY]' : ''}\n`);
  return due.slice(0, LIMIT);
}

async function runDelete(client, docs) {
  // Every id here is a `drafts.*` id, so deleting only removes the draft; a published listing is never touched.
  const existing = await client.fetch('*[_id in $ids]._id', { ids: docs.map((d) => d._id) });
  if (!existing.length) { console.log('No matching drafts found in Sanity — nothing to delete.'); return; }
  console.log(`Found ${existing.length} matching draft(s):`);
  existing.forEach((id) => console.log(`  - ${id}`));
  if (DRY_RUN) { console.log(`\nPreview only — nothing deleted. ${existing.length} draft(s) would be removed.`); return; }
  if (!YES && !(await confirm(`\nDelete these ${existing.length} draft(s)? This cannot be undone. (y/N) `))) { console.log('Nothing deleted.'); return; }
  await mapPool(existing, 5, async (id) => { await client.delete(id); console.log(`  ✗ deleted ${id}`); });
  console.log(`\nDone. Deleted ${existing.length} draft(s).`);
}

/** Drafts with no photos yet (plus, before creating, the new ones), and where each one's photos stand. */
async function photoPlan(client, newDocs) {
  const bare = await client.fetch(`*[_type == "listing" && _id in path("drafts.**") && !defined(image.asset) && count(coalesce(imagesGallery, [])) == 0]{_id, name, gradenumber, image}`);
  const known = new Set(bare.map((d) => d._id));
  const folders = photoFolders();
  return [...bare, ...newDocs.filter((d) => !known.has(d._id))].map((d) => ({ draft: d, found: findPhotos(d.gradenumber, folders) }));
}

async function main() {
  const client = sanity();
  const usedSlugs = new Set();
  const docs = (await dueFromWorkbook(client)).map((w) => buildDoc(w, usedSlugs));

  if (DELETE) { await runDelete(client, docs); return; }

  const existing = new Set(await client.fetch('*[_id in $ids]._id', { ids: docs.map((d) => d._id) }));
  const toCreate = docs.filter((d) => !existing.has(d._id));
  const photos = await photoPlan(client, toCreate);
  const ready = photos.filter((p) => p.found?.ready);

  // Preview
  console.log(toCreate.length ? `New listings to create (Website = R, no listing yet): ${toCreate.length}` : 'No new listings to create.');
  for (const d of toCreate) {
    console.log(`  • ${d.name}`);
    console.log(`      price=${d.price ?? '—'}  grade=${d.grade ?? '—'}  cac=${d.cac}  grading=${d.gradingCompany}  cert=${d.gradenumber ?? '—'}`);
    console.log(`      date=${d.date ?? '—'}  dateshown=${d.dateshown ?? '—'}  pcgs#=${d.pcgsDesignationNumber ? `${d.pcgsDesignationNumber} (sorts as ${d.pcgsCatalogNumber})` : (d.pcgsCatalogNumber ?? '—')}  cat=${d.category ?? '—'}`);
    console.log(`      alt=${d.image?.alt ? `"${d.image.alt}"` : '(none)'}`);
  }
  if (photos.length) {
    console.log(`\nPhotos for ${photos.length} draft(s) without any (✓ = ready to add):`);
    for (const { draft, found } of photos) console.log(`  ${found?.ready ? '✓' : '·'} ${draft.name}: ${photoStatus(draft.gradenumber, found)}`);
  }
  if (warnings.length) {
    console.log('\n⚠ Warnings:');
    warnings.forEach((w) => console.log(`  - ${w}`));
  }
  console.log('');

  if (!toCreate.length && !ready.length) { console.log('Nothing to do.'); return; }
  const plan = [toCreate.length && `create ${toCreate.length} draft(s)`, ready.length && `add photos to ${ready.length}`].filter(Boolean).join(' and ');
  if (DRY_RUN) { console.log(`Preview only — nothing written. It would ${plan}.`); return; }
  if (!YES && !(await confirm(`Go ahead: ${plan}? (y/N) `))) { console.log('Nothing written.'); process.exitCode = 3; return; }

  // Create (drafts that already exist are skipped above, so re-runs are safe)
  for (const doc of toCreate) { await client.create(doc); console.log(`  ✓ created ${doc.name}`); }
  // Photos
  for (const { draft, found } of ready) {
    await putPhotos(client, draft, found);
    console.log(`  ✓ photos added: ${draft.name}`);
  }
  console.log(`\nDone: ${plan}. Next: 3_Choose-Captions, then write the description in the Studio and publish.`);
}

// Run only when started directly (tests import buildDoc without running anything).
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error('\nImport failed:', err.message);
    process.exit(1);
  });
}
