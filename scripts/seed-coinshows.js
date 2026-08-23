/**
 * One-time seed: creates the six coin shows that were previously hardcoded in
 * `web/coinshows.njk` as `coinShow` documents in Sanity.
 *
 * Data transcribed verbatim from that file before it was converted to a
 * data-driven template. After this runs, the schedule is managed entirely in
 * Studio under "Coin Shows" and this script has no further use.
 *
 * NOTE: document ids must NOT contain a dot. Sanity treats a dotted id as a
 * path-prefixed document (the same mechanism that hides `drafts.*`) and the
 * public API refuses to serve it — the 11ty build reads anonymously, so such
 * documents exist in Studio but render as an empty page. Ids here are plain
 * `coinshow-<slug>-<startDate>`.
 *
 * These are created PUBLISHED (not drafts) so the live page keeps working on
 * the very next deploy. Ids are deterministic (`coinShow.<slug>-<startDate>`),
 * so a second run updates the same six documents instead of duplicating them —
 * but note that a re-run OVERWRITES any edits made in Studio since.
 *
 * Usage:
 *   node seed-coinshows.js --dry-run     Preview the documents, write nothing.
 *   node seed-coinshows.js               Write them (prompts first).
 *   node seed-coinshows.js --yes         Write them without prompting.
 *
 * Env (see .env.example): SANITY_WRITE_TOKEN,
 *   optional SANITY_PROJECT_ID, SANITY_DATASET.
 */

import path from 'node:path';
import process from 'node:process';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { createClient } from '@sanity/client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const YES = args.includes('--yes');

const PROJECT_ID = process.env.SANITY_PROJECT_ID || 'la880an7';
const DATASET = process.env.SANITY_DATASET || 'production';

// Transcribed from the old hardcoded coinshows.njk. Note the two shows whose
// `data-end` values were not zero-padded there (2026-08-8, 2026-10-3) — they
// are correct ISO dates here, which is part of the point of the migration.
const SHOWS = [
  {
    name: 'Whitman Summer Expo',
    startDate: '2026-06-11',
    endDate: '2026-06-13',
    city: 'Baltimore',
    state: 'MD',
    tableNumber: '655',
    url: 'https://whitmanexpo.com/baltimore-summer-expo/',
  },
  {
    name: 'FUN Show',
    startDate: '2026-07-09',
    endDate: '2026-07-11',
    city: 'Orlando',
    state: 'FL',
    tableNumber: '635',
    url: 'http://www.funtopics.com/summer-fun.html',
  },
  {
    name: 'Bay State Coin Show',
    startDate: '2026-07-23',
    endDate: '2026-07-25',
    city: 'Marlborough',
    state: 'MA',
    tableNumber: '', // was "TBD" — left blank so the page supplies TBD itself
    url: 'https://www.baystatecoinshow.com/',
  },
  {
    name: 'Blue Ridge Numismatic Association',
    startDate: '2026-08-06',
    endDate: '2026-08-08',
    city: 'Dalton',
    state: 'GA',
    tableNumber: '911',
    url: 'https://www.brna.org',
  },
  {
    name: 'ANA WFoM',
    startDate: '2026-08-25',
    endDate: '2026-08-29',
    city: 'Pittsburgh',
    state: 'PA',
    tableNumber: '1707',
    url: 'https://www.money.org/worldsfairofmoney/',
  },
  {
    name: 'Great American Coin & Collectibles Show 2026',
    startDate: '2026-10-01',
    endDate: '2026-10-03',
    city: 'Rosemont',
    state: 'IL',
    tableNumber: '', // was "TBD"
    url: 'https://www.gacc.show/',
  },
];

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function toDoc(show) {
  const doc = {
    _id: `coinshow-${slugify(show.name)}-${show.startDate}`,
    _type: 'coinShow',
    name: show.name,
    startDate: show.startDate,
    endDate: show.endDate,
    city: show.city,
    state: show.state,
  };
  // Omit empty optional fields rather than storing empty strings.
  if (show.tableNumber) doc.tableNumber = show.tableNumber;
  if (show.url) doc.url = show.url;
  return doc;
}

async function confirm(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question(question)).trim().toLowerCase();
  rl.close();
  return answer === 'y' || answer === 'yes';
}

async function main() {
  const docs = SHOWS.map(toDoc);

  console.log(`\nProject: ${PROJECT_ID}   Dataset: ${DATASET}`);
  console.log(`Preparing ${docs.length} coinShow document(s):\n`);
  docs.forEach((d) => {
    const table = d.tableNumber ? `Table ${d.tableNumber}` : 'Table (blank → TBD)';
    console.log(`  ${d.startDate} → ${d.endDate}  ${d.name}`);
    console.log(`      ${d.city}, ${d.state}  ·  ${table}`);
    console.log(`      _id: ${d._id}`);
    console.log(`      url: ${d.url || '(none)'}\n`);
  });

  if (DRY_RUN) {
    console.log('Dry run — nothing written to Sanity.');
    return;
  }

  if (!process.env.SANITY_WRITE_TOKEN) {
    console.error('SANITY_WRITE_TOKEN is not set. Add it to scripts/.env (Editor-permission token).');
    process.exit(1);
  }

  if (!YES) {
    const ok = await confirm(
      `Write these ${docs.length} PUBLISHED documents to ${PROJECT_ID}/${DATASET}? (y/N) `
    );
    if (!ok) {
      console.log('Aborted — nothing written.');
      return;
    }
  }

  const client = createClient({
    projectId: PROJECT_ID,
    dataset: DATASET,
    apiVersion: '2024-01-01',
    token: process.env.SANITY_WRITE_TOKEN,
    useCdn: false,
  });

  // The first run of this script used dotted ids, which the public API will not
  // serve. Remove any that are still lying around before writing the good ones.
  const legacyIds = await client.fetch(
    `*[_type == "coinShow" && string::startsWith(_id, "coinShow.")]._id`
  );
  if (legacyIds.length) {
    console.log(`Removing ${legacyIds.length} legacy dotted-id document(s):`);
    legacyIds.forEach((id) => console.log(`  ✗ ${id}`));
  }

  let tx = client.transaction();
  legacyIds.forEach((id) => { tx = tx.delete(id); });
  docs.forEach((doc) => { tx = tx.createOrReplace(doc); });
  await tx.commit();

  docs.forEach((d) => console.log(`  ✓ ${d._id}`));
  console.log(`\nDone. Wrote ${docs.length} coin show(s).`);
  console.log('Now hit the "Blog Website" deploy button on the Studio dashboard to rebuild.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
