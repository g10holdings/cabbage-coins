/**
 * Check the website against the workbook (the business's source of truth).
 *
 * Reads the workbook's "inventory" sheet (read-only: see workbook.js) and every listing in Sanity,
 * matches them by cert # (the workbook's inventoryID without any "_2"; the listing's Grade Number),
 * and reports what doesn't line up. It changes NOTHING, in the workbook or in Sanity.
 *
 * Reported:
 *   - for sale on the site, but Sold in the workbook
 *   - workbook says Website = Y and Active, but there's no listing yet (the import creates these)
 *   - for sale on the site, but the workbook doesn't say Website = Y
 *   - on the site, with no workbook row at all
 *   - matched coins whose price, grade, grading company, date or PCGS #s differ
 *   - names worded differently (FYI only)
 *
 * Usage: node check-workbook.js
 * Env (engine/.env): optional WORKBOOK_PATH.
 */

import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { createClient } from '@sanity/client';
import { readInventory, certKey, nameKey, hasCert, listingFromRow } from './workbook.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

// Listings the check leaves alone, by cert # (Tony, 2026-10-17).
const IGNORE = new Map([
  ['6042153-049', '2020-W Palladium Eagle: a stand-in listing; Tony shows one of several at a time'],
]);

const money = (n) => (n == null || n === '' ? '—' : `$${Number(n).toLocaleString()}`);
const loose = (s) => String(s ?? '').toUpperCase().replace(/\s+/g, '');

async function main() {
  const { rows, file, savedAt } = readInventory();
  const client = createClient({ projectId: 'la880an7', dataset: 'production', apiVersion: '2024-01-01', useCdn: false, token: process.env.SANITY_WRITE_TOKEN });
  const listings = await client.fetch(`*[_type == "listing"]{_id, name, sold, price, gradenumber, date, dateshown, grade, gradingCompany, pcgsCatalogNumber, pcgsDesignationNumber}`);

  console.log(`Workbook: ${file}  (saved ${savedAt.toLocaleString()}, ${rows.length} inventory rows; opened read-only)`);
  const published = listings.filter((l) => !l._id.startsWith('drafts.'));
  const drafts = listings.filter((l) => l._id.startsWith('drafts.'));
  console.log(`Website:  ${published.filter((l) => !l.sold).length} for sale, ${published.filter((l) => l.sold).length} sold, ${drafts.length} drafts\n`);

  // Match on cert #; items without one (ingots, raw coins) match on name.
  const book = new Map(), bookByName = new Map();
  for (const r of rows) {
    if (r.inventoryID == null) continue;
    book.set(certKey(r.inventoryID), r);   // a later "_2" row wins over an old one
    bookByName.set(nameKey(r.itemDescription), r);
  }
  const rowFor = (l) => (hasCert(l.gradenumber) ? book.get(certKey(l.gradenumber)) : null) ?? bookByName.get(nameKey(l.name));
  const listedKeys = new Set(listings.filter((l) => hasCert(l.gradenumber)).map((l) => certKey(l.gradenumber)));
  const listedNames = new Set(listings.map((l) => nameKey(l.name)));
  const hasListing = (w) => listedKeys.has(w.key) || listedNames.has(nameKey(w.name));

  const soldInBook = [], notFlagged = [], noRow = [], diffs = [], names = [];
  const ignored = published.filter((x) => !x.sold && IGNORE.has(certKey(x.gradenumber)));
  for (const l of published.filter((x) => !x.sold && !IGNORE.has(certKey(x.gradenumber)))) {
    const r = rowFor(l);
    if (!r) { noRow.push(l); continue; }
    const w = listingFromRow(r);
    if (w.status === 'Sold') soldInBook.push([l, w]);
    else if (w.website !== 'Y') notFlagged.push([l, w]);
    const d = [];
    // A sold row's listPrice is the sale amount, already shown above.
    if (w.status !== 'Sold' && Number(l.price) !== w.price) d.push(`price: site ${money(l.price)}, workbook ${money(w.price)}`);
    if (loose(l.grade) !== loose(w.grade) && w.grade) d.push(`grade: site "${l.grade}", workbook "${w.grade}"`);
    if (l.gradingCompany !== w.gradingCompany) d.push(`grading company: site ${l.gradingCompany}, workbook ${w.gradingCompany}`);
    if (loose(l.dateshown) !== loose(w.dateShown) && w.dateShown) d.push(`date shown: site "${l.dateshown}", workbook "${w.dateShown}"`);
    if (w.pcgsCatalogNumber && Number(l.pcgsCatalogNumber) !== w.pcgsCatalogNumber) d.push(`PCGS catalog #: site ${l.pcgsCatalogNumber ?? '—'}, workbook ${w.pcgsCatalogNumber}`);
    const designation = w.pcgsPopNumber !== w.pcgsCatalogNumber ? w.pcgsPopNumber : null;
    if ((l.pcgsDesignationNumber ?? null) !== designation) d.push(`PCGS # with designation: site ${l.pcgsDesignationNumber ?? '—'}, workbook ${designation ?? '—'}`);
    if (d.length) diffs.push([l, d]);
    if (loose(l.name) !== loose(w.name)) names.push([l, w]);
  }
  const toCreate = rows.map(listingFromRow).filter((w) => w.website === 'Y' && w.status === 'Active' && w.key && !hasListing(w));

  const section = (title, list, line) => {
    console.log(`${list.length ? '✗' : '✓'} ${title}: ${list.length}`);
    for (const x of list) console.log(`    ${line(x)}`);
    console.log('');
  };
  section('For sale on the site, but SOLD in the workbook', soldInBook, ([l, w]) => `${l.name}  (site ${money(l.price)}, sold for ${money(w.price)})`);
  section('Workbook says Website = Y, but there is no listing yet (the import creates these)', toCreate, (w) => `${w.name}  ${money(w.price)}  cert ${w.cert}`);
  section('For sale on the site, but the workbook does not say Website = Y', notFlagged, ([l, w]) => `${l.name}  (Website column: "${w.website || 'blank'}")`);
  section('On the site, with no workbook row for its cert #', noRow, (l) => `${l.name}  (Grade Number "${l.gradenumber ?? ''}")`);
  section('Coins whose details differ', diffs, ([l, d]) => `${l.name}\n        ${d.join('\n        ')}`);
  console.log(`  FYI: ${names.length} name(s) are worded differently on the site (not an error):`);
  for (const [l, w] of names) console.log(`    site:     ${l.name}\n    workbook: ${w.name}`);
  if (ignored.length) console.log(`\n  Not checked, on purpose (IGNORE list in check-workbook.js): ${ignored.map((l) => l.name).join('; ')}`);
  console.log('\nNothing was changed, in the workbook or on the website.');
}

main().catch((err) => {
  console.error(`\n✗ ${err.message}`);
  process.exitCode = 1;
});
