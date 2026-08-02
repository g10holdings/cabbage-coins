/**
 * Bulk-create DRAFT coin listings in Sanity from a CSV.
 *
 * Reads a CSV, maps each row to a `listing` document, generates the image
 * Alternative Text with Claude (Haiku), and writes each doc as a Sanity draft
 * (so it lands unpublished in the Studio for you to add photos + description).
 *
 * Usage:
 *   node import-listings.js [path/to/file.csv] [flags]
 *
 * Flags:
 *   --dry-run     Build + preview everything (incl. AI alt text) but write nothing to Sanity.
 *   --no-alt      Skip the Claude call; leave Alternative Text blank.
 *   --limit N     Only process the first N rows (handy for a test run).
 *   --delete      Delete the DRAFT listings matching this CSV (never touches published docs).
 *   --yes         Skip the confirmation prompt (use with --delete for unattended runs).
 *
 * Env (see .env.example): SANITY_WRITE_TOKEN, ANTHROPIC_API_KEY,
 *   optional SANITY_PROJECT_ID, SANITY_DATASET.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { parse } from 'csv-parse/sync';
import { createClient } from '@sanity/client';
import Anthropic from '@anthropic-ai/sdk';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const NO_ALT = args.includes('--no-alt');
const DELETE = args.includes('--delete');
const YES = args.includes('--yes');
const limitIdx = args.indexOf('--limit');
const LIMIT = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : Infinity;
const DEFAULT_CSV = 'D:/OneDrive/G10 Holdings LLC/35Listings_22Jul26.csv';
const csvPath = args.find((a) => !a.startsWith('--') && a !== String(LIMIT)) || DEFAULT_CSV;

const PROJECT_ID = process.env.SANITY_PROJECT_ID || 'la880an7';
const DATASET = process.env.SANITY_DATASET || 'production';

// Schema enums (studio/schemas/documents/listing.js)
const GRADING_COMPANIES = ['PCGS', 'NGC', 'CACG', 'Ungraded'];
const CATEGORIES = [
  'Copper/Bronze', 'Silver', 'Gold', 'Vintage Ingot',
  'Paper Currency', 'Foreign', 'Other',
];

const warnings = [];
const warn = (msg) => warnings.push(msg);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Builds a URL-safe token from the name (used only for the internal draft id). */
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

/** Case-insensitive column lookup so header casing/spacing doesn't matter. */
function field(row, name) {
  const key = Object.keys(row).find(
    (k) => k.trim().toLowerCase() === name.toLowerCase()
  );
  const v = key ? row[key] : undefined;
  return v == null ? '' : String(v).trim();
}

function toNumber(raw) {
  if (!raw) return undefined;
  const n = Number(String(raw).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : undefined;
}

function toInt(raw) {
  if (!raw) return undefined;
  const n = parseInt(String(raw).replace(/[^0-9\-]/g, ''), 10);
  return Number.isFinite(n) ? n : undefined;
}

function normalizeGradingCompany(raw, rowLabel) {
  const v = raw.trim();
  if (!v || /^(n\/?a|none|raw|ungraded)$/i.test(v)) return 'Ungraded';
  const match = GRADING_COMPANIES.find((g) => g.toLowerCase() === v.toLowerCase());
  if (match) return match;
  warn(`${rowLabel}: grading company "${v}" is not one of ${GRADING_COMPANIES.join('/')} — kept as-is.`);
  return v;
}

function normalizeCategory(raw, rowLabel) {
  const v = raw.trim();
  if (!v) return undefined;
  const match = CATEGORIES.find((c) => c.toLowerCase() === v.toLowerCase());
  if (match) return match;
  warn(`${rowLabel}: category "${v}" is not a known option (${CATEGORIES.join(', ')}) — kept as-is.`);
  return v;
}

const MINT_MARK_RE = /-\s*[A-Za-z]{1,3}$/; // e.g. "1900-S", "1870-CC"

/** Simple concurrency-limited async map. */
async function mapPool(items, limit, fn) {
  const results = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return results;
}

// ---------------------------------------------------------------------------
// Alternative-text generation (Claude Haiku)
// ---------------------------------------------------------------------------
const ALT_SYSTEM = `You write short, plain-language ALT TEXT for the images on a coin dealer's website.
You are given a coin's listing title, its metal category, and its denomination.
Return a concise 6-14 word description of what the coin physically looks like: its color/metal and the main design elements (portraits, animals, emblems, mottos, wreaths, etc.).
Rules:
- Describe imagery only. Do NOT mention the grade, price, year/date, mint mark, certification company (PCGS/NGC/CACG), CAC, or varieties like "doubled die".
- Use the metal category for the color: Copper/Bronze -> "copper", Silver -> "silver", Gold -> "gold".
- Lowercase. No surrounding quotes. No trailing period. Output only the phrase.
Examples:
Title: "1909-S VDB 1C Lincoln Cent" (Copper/Bronze, 1C) -> copper cent with a portrait of lincoln and the liberty motto
Title: "1881-S $1 Morgan Silver Dollar" (Silver, $1) -> silver dollar with liberty's head and an eagle clutching arrows
Title: "1913 $10 Indian Head Eagle" (Gold, $10) -> gold coin with a native american headdress and a standing eagle`;

async function generateAltText(anthropic, { name, category, denomination }) {
  const resp = await anthropic.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 64,
    system: ALT_SYSTEM,
    messages: [
      { role: 'user', content: `Title: "${name}" (${category || 'Unknown'}, ${denomination || 'Unknown'})` },
    ],
  });
  if (resp.stop_reason === 'refusal') return '';
  const text = resp.content.find((b) => b.type === 'text')?.text ?? '';
  return text.trim().replace(/^["']|["']$/g, '').replace(/\.$/, '').toLowerCase();
}

// ---------------------------------------------------------------------------
// Row -> Sanity document
// ---------------------------------------------------------------------------
function buildDoc(row, rowLabel, usedSlugs) {
  const name = field(row, 'name');
  if (!name) {
    warn(`${rowLabel}: no name — row skipped.`);
    return null;
  }

  const csvDate = field(row, 'date'); // plain year, e.g. "1900"
  const csvDateShown = field(row, 'date shown'); // with mint mark, e.g. "1900-S"

  // Safety net for the known column-swap: warn if the mint mark still looks like
  // it's in the plain-year column (i.e. the CSV wasn't re-saved after swapping).
  if (MINT_MARK_RE.test(csvDate) && !MINT_MARK_RE.test(csvDateShown)) {
    warn(`${rowLabel}: "date" column ("${csvDate}") looks like it has a mint mark while "date shown" ("${csvDateShown}") doesn't — the two date columns may still be swapped. Expected date=plain year, date shown=with mint mark.`);
  }

  const grade = field(row, 'Grade');

  // Internal, unique document id derived from the name. The visible `slug`
  // field is left blank on purpose — you generate it in the Studio when you
  // review each listing and upload photos.
  let idBase = slugify(name);
  if (usedSlugs.has(idBase)) {
    let n = 2;
    while (usedSlugs.has(`${idBase}-${n}`)) n++;
    idBase = `${idBase}-${n}`;
  }
  usedSlugs.add(idBase);

  const doc = {
    _id: `drafts.${idBase}`,
    _type: 'listing',
    name,
    sold: false,
    featured: false,
    cac: /\bCAC\b/i.test(grade),
  };

  if (csvDate) doc.date = csvDate;
  if (csvDateShown) doc.dateshown = csvDateShown;
  const denomination = field(row, 'denomination');
  if (denomination) doc.denomination = denomination;
  if (grade) doc.grade = grade;
  const gradenumber = field(row, 'grade number');
  if (gradenumber) doc.gradenumber = gradenumber;
  const price = toNumber(field(row, 'Price'));
  if (price !== undefined) doc.price = price;
  doc.gradingCompany = normalizeGradingCompany(field(row, 'Grading Company'), rowLabel);
  const pcgs = toInt(field(row, 'PCGS Catalog Number'));
  if (pcgs !== undefined) doc.pcgsCatalogNumber = pcgs;
  const category = normalizeCategory(field(row, 'Category'), rowLabel);
  if (category) doc.category = category;

  // Caption + Description intentionally left blank (filled in Studio).
  // Alternative Text is attached later, after the AI pass.
  doc.__meta = { name, category, denomination };
  return doc;
}

// ---------------------------------------------------------------------------
// Sanity client + delete mode
// ---------------------------------------------------------------------------
function makeClient() {
  if (!process.env.SANITY_WRITE_TOKEN) {
    console.error('SANITY_WRITE_TOKEN is not set. Add it to scripts/.env (Editor-permission token).');
    process.exit(1);
  }
  return createClient({
    projectId: PROJECT_ID,
    dataset: DATASET,
    apiVersion: '2024-01-01',
    token: process.env.SANITY_WRITE_TOKEN,
    useCdn: false,
  });
}

async function confirm(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question(question)).trim().toLowerCase();
  rl.close();
  return answer === 'y' || answer === 'yes';
}

async function runDelete(docs) {
  // Every id here is a `drafts.*` id, so deleting only removes the draft —
  // any published version of the same listing is left untouched.
  const ids = docs.map((d) => d._id);
  const client = makeClient();
  const existing = await client.fetch('*[_id in $ids]._id', { ids });

  if (!existing.length) {
    console.log('No matching drafts found in Sanity — nothing to delete.');
    return;
  }

  console.log(`Found ${existing.length} matching draft(s):`);
  existing.forEach((id) => console.log(`  - ${id}`));

  if (DRY_RUN) {
    console.log(`\nDry run — nothing deleted. ${existing.length} draft(s) would be removed.`);
    return;
  }

  if (!YES) {
    const ok = await confirm(`\nDelete these ${existing.length} draft(s)? This cannot be undone. (y/N) `);
    if (!ok) {
      console.log('Aborted — nothing deleted.');
      return;
    }
  }

  let deleted = 0;
  await mapPool(existing, 5, async (id) => {
    await client.delete(id);
    deleted++;
    console.log(`  ✗ deleted ${id}`);
  });
  console.log(`\nDone. Deleted ${deleted} draft(s).`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  if (!fs.existsSync(csvPath)) {
    console.error(`CSV not found: ${csvPath}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(csvPath, 'utf8');
  let rows = parse(raw, { columns: true, skip_empty_lines: true, trim: true, bom: true });
  if (Number.isFinite(LIMIT)) rows = rows.slice(0, LIMIT);

  console.log(`Read ${rows.length} row(s) from ${csvPath}`);
  console.log(`Project ${PROJECT_ID} / dataset ${DATASET}${DRY_RUN ? '  [DRY RUN]' : ''}\n`);

  // Build docs.
  const usedSlugs = new Set();
  const docs = rows
    .map((row, idx) => buildDoc(row, `Row ${idx + 2}`, usedSlugs)) // +2: header row + 1-based
    .filter(Boolean);

  // Delete mode: remove the matching drafts and stop (no alt text, no create).
  if (DELETE) {
    docs.forEach((d) => delete d.__meta);
    await runDelete(docs);
    return;
  }

  // Generate Alternative Text.
  if (NO_ALT) {
    console.log('Skipping Alternative Text generation (--no-alt).\n');
  } else {
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error('ANTHROPIC_API_KEY is not set. Add it to scripts/.env, or run with --no-alt.');
      process.exit(1);
    }
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    console.log('Generating Alternative Text with Claude Haiku…');
    let done = 0;
    await mapPool(docs, 5, async (doc) => {
      try {
        const alt = await generateAltText(anthropic, doc.__meta);
        if (alt) doc.image = { _type: 'mainImage', alt };
      } catch (err) {
        warn(`${doc.__meta.name}: alt-text generation failed (${err.message}).`);
      }
      done++;
      if (done % 5 === 0 || done === docs.length) console.log(`  ${done}/${docs.length}`);
    });
    console.log('');
  }

  // Preview.
  console.log('Prepared listings:');
  for (const d of docs) {
    console.log(`  • ${d.name}`);
    console.log(`      id=${d._id}  price=${d.price ?? '—'}  grade=${d.grade ?? '—'}  cac=${d.cac}`);
    console.log(`      date=${d.date ?? '—'}  dateshown=${d.dateshown ?? '—'}  grading=${d.gradingCompany}  cat=${d.category ?? '—'}`);
    console.log(`      alt=${d.image?.alt ? `"${d.image.alt}"` : '(none)'}`);
  }
  console.log('');

  if (warnings.length) {
    console.log('⚠ Warnings:');
    warnings.forEach((w) => console.log(`  - ${w}`));
    console.log('');
  }

  // Strip helper field before writing.
  docs.forEach((d) => delete d.__meta);

  if (DRY_RUN) {
    console.log(`Dry run complete — nothing written. ${docs.length} draft(s) would be created.`);
    return;
  }

  const client = makeClient();

  // Skip drafts that already exist (idempotent re-runs).
  const ids = docs.map((d) => d._id);
  const existing = new Set(
    await client.fetch('*[_id in $ids]._id', { ids })
  );
  const toCreate = docs.filter((d) => !existing.has(d._id));
  const skipped = docs.length - toCreate.length;
  if (skipped) console.log(`${skipped} draft(s) already exist — skipping those.`);

  console.log(`Creating ${toCreate.length} draft(s)…`);
  let created = 0;
  await mapPool(toCreate, 5, async (doc) => {
    await client.create(doc);
    created++;
    console.log(`  ✓ ${doc.name}`);
  });

  console.log(`\nDone. Created ${created} draft listing(s) in Sanity.`);
  console.log('Open the Studio (npm run dev in studio/, then localhost:3333) to add photos, captions, and descriptions, then publish.');
}

main().catch((err) => {
  console.error('\nImport failed:', err.message);
  process.exit(1);
});
