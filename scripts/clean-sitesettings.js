/**
 * One-time cleanup of the `siteSettings` document (2026-08-23).
 *
 * Six fields were removed from the schema because nothing on the site read
 * them — see studio/schemas/documents/siteSettings.js for the reasoning. The
 * stored VALUES survive a schema change, and Studio renders leftover values as
 * "field is not defined in schema" warnings, so they have to be unset too.
 *
 * Also discards the stray `drafts.siteSettings`, whose only change was a
 * trailing ". " accidentally typed into Title — a field that IS live, so
 * publishing it would have put a stray period in every browser tab.
 *
 * Usage:
 *   node clean-sitesettings.js --dry-run   Show what would change.
 *   node clean-sitesettings.js             Apply it (prompts first).
 *   node clean-sitesettings.js --yes       Apply without prompting.
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

const DEAD_FIELDS = [
  'keywords',
  'author',
  'frontpagemessage',
  'aboutustext',
  'aboutusbio',
  'aboutusbioimage',
];

const KEEP = ['title', 'description'];

async function confirm(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question(question)).trim().toLowerCase();
  rl.close();
  return answer === 'y' || answer === 'yes';
}

async function main() {
  if (!process.env.SANITY_WRITE_TOKEN) {
    console.error('SANITY_WRITE_TOKEN is not set. Add it to scripts/.env (Editor-permission token).');
    process.exit(1);
  }

  const client = createClient({
    projectId: PROJECT_ID, dataset: DATASET,
    apiVersion: '2024-01-01', token: process.env.SANITY_WRITE_TOKEN, useCdn: false,
  });

  console.log(`\nProject: ${PROJECT_ID}   Dataset: ${DATASET}\n`);

  const published = await client.getDocument('siteSettings');
  const draft = await client.getDocument('drafts.siteSettings');

  if (!published) {
    console.error('No siteSettings document found — nothing to do.');
    process.exit(1);
  }

  console.log('KEEPING (these are read by the site):');
  KEEP.forEach((f) => console.log(`  ${f}: ${JSON.stringify(published[f])}`));

  const present = DEAD_FIELDS.filter((f) => published[f] !== undefined);
  console.log('\nUNSETTING (read by nothing):');
  if (!present.length) console.log('  (already clean)');
  present.forEach((f) => {
    const v = JSON.stringify(published[f]);
    console.log(`  ${f}: ${v && v.length > 70 ? v.slice(0, 70) + '…' : v}`);
  });

  console.log('\nDRAFT:');
  if (draft) {
    console.log(`  drafts.siteSettings exists — will be discarded.`);
    if (draft.title !== published.title) {
      console.log(`    draft title:     ${JSON.stringify(draft.title)}`);
      console.log(`    published title: ${JSON.stringify(published.title)}  <- the one that stays`);
    }
  } else {
    console.log('  none');
  }

  if (DRY_RUN) {
    console.log('\nDry run — nothing written.');
    return;
  }

  if (!present.length && !draft) {
    console.log('\nNothing to do.');
    return;
  }

  if (!YES) {
    const ok = await confirm(`\nApply to ${PROJECT_ID}/${DATASET}? (y/N) `);
    if (!ok) { console.log('Aborted — nothing written.'); return; }
  }

  let tx = client.transaction();
  if (present.length) tx = tx.patch('siteSettings', (p) => p.unset(present));
  if (draft) tx = tx.delete('drafts.siteSettings');
  await tx.commit();

  console.log(`\nDone. Unset ${present.length} field(s)${draft ? ' and discarded the draft' : ''}.`);
  console.log('Deploy "Sanity Studio" to pick up the new schema.');
}

main().catch((err) => { console.error(err); process.exit(1); });
