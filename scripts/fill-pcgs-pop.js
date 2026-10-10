/**
 * Fill in PCGS population (±2 grades, with + grades) on unsold PCGS listings.
 *
 * For each unsold PCGS listing — drafts first (the new batch), then published — that
 * has no population saved yet, or whose cert number changed, it asks PCGS for the
 * population around the coin's grade (about 6 calls per coin, see pcgs-pop.js) and
 * saves it on the listing as `pcgsPop`. The listing page shows it as a grid.
 *
 * PCGS allows 100 calls a day for the whole account (shared with The Cabbage Patch).
 * So the script stops at --max-calls, or when PCGS says the limit is reached, and
 * you run it again the next day: it picks up where it left off. Every PCGS answer is
 * kept in .pcgs-cache.json, so stopping part-way through a coin wastes nothing.
 *
 * Usage:
 *   node fill-pcgs-pop.js [flags]
 *
 * Flags:
 *   --dry-run          Show what would be fetched and written; no PCGS calls, no writes.
 *   --max-calls N      Stop after N PCGS calls this run (default 90).
 *   --refresh-days N   Also re-fetch listings whose population is older than N days (e.g. 120).
 *
 * Env (scripts/.env): SANITY_WRITE_TOKEN, PCGS_API_TOKEN.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { createClient } from '@sanity/client';
import { fetchPopGrid, PcgsLimitError } from './pcgs-pop.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const num = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 && Number.isFinite(Number(args[i + 1])) ? Number(args[i + 1]) : dflt;
};
const DRY_RUN = flag('--dry-run');
const MAX_CALLS = num('--max-calls', 90);
const REFRESH_DAYS = num('--refresh-days', null);
const DAY = 24 * 3600_000;
// Bumped when the saved shape changes, so older entries are redone (2: grade includes the designation, e.g. MS67FB).
const VERSION = 2;

const CACHE_FILE = path.join(__dirname, '.pcgs-cache.json');
// Saved PCGS answers are reused for 30 days; a refresh asks again for anything older than the refresh age.
const CACHE_TTL = Math.min(30, REFRESH_DAYS ?? 30) * DAY;

class BudgetReached extends Error {}

function loadCache() {
  let saved = {};
  try { saved = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')); } catch { /* first run */ }
  const now = Date.now();
  return {
    get(key) {
      const hit = saved[key];
      return hit && now - hit.savedAt < CACHE_TTL ? hit.value : undefined;
    },
    set(key, value) { saved[key] = { value, savedAt: Date.now() }; },
    save() { fs.writeFileSync(CACHE_FILE, JSON.stringify(saved)); },
  };
}

const baseId = (id) => id.replace(/^drafts\./, '');
// Tony adds "_2", "_3" to the Grade Number when the same coin comes back into stock (keeps his spreadsheet rows
// unique): the cert is the part before it.
const certOf = (doc) => String(doc.gradenumber ?? '').trim().replace(/_\d+$/, '').replace(/\D/g, '');

function needsPop(doc) {
  const p = doc.pcgsPop;
  if (!p?.cells?.length) return 'missing';
  if (p.v !== VERSION) return 'saved by an older version';
  if (p.cert !== certOf(doc)) return 'cert changed';
  if (REFRESH_DAYS != null && Date.now() - Date.parse(p.asOf) > REFRESH_DAYS * DAY) return `older than ${REFRESH_DAYS} days`;
  return null;
}

async function main() {
  const { SANITY_WRITE_TOKEN, PCGS_API_TOKEN } = process.env;
  if (!SANITY_WRITE_TOKEN) throw new Error('SANITY_WRITE_TOKEN is missing from scripts/.env');
  if (!PCGS_API_TOKEN && !DRY_RUN) throw new Error('PCGS_API_TOKEN is missing from scripts/.env');

  const client = createClient({
    projectId: process.env.SANITY_PROJECT_ID || 'la880an7',
    dataset: process.env.SANITY_DATASET || 'production',
    apiVersion: '2024-01-01',
    token: SANITY_WRITE_TOKEN,
    useCdn: false,
    perspective: 'raw',
  });

  const docs = await client.fetch(
    `*[_type == "listing" && gradingCompany == "PCGS" && sold != true && defined(gradenumber)]
      {_id, _createdAt, name, gradenumber, pcgsPop}`,
  );

  // One coin per listing, whether it exists as a draft, a published doc, or both (both get written,
  // so publishing a draft later can't drop the population). Drafts first: they're the batch being prepared.
  const coins = new Map();
  for (const d of docs) {
    const c = coins.get(baseId(d._id)) ?? { name: d.name, cert: certOf(d), ids: [], isDraft: false, reason: null, createdAt: d._createdAt };
    c.ids.push(d._id);
    if (d._id.startsWith('drafts.')) { c.isDraft = true; c.name = d.name; c.cert = certOf(d); }
    c.reason ??= needsPop(d);
    coins.set(baseId(d._id), c);
  }
  const todo = [...coins.values()]
    .filter((c) => c.reason && /^\d{5,9}$/.test(c.cert))
    .sort((a, b) => (b.isDraft - a.isDraft) || String(b.createdAt).localeCompare(String(a.createdAt)));
  const skipped = [...coins.values()].filter((c) => c.reason && !/^\d{5,9}$/.test(c.cert));

  console.log(`PCGS population: ${todo.length} listing(s) to fill${DRY_RUN ? '  [DRY RUN]' : ''}, up to ${MAX_CALLS} PCGS calls this run.\n`);
  for (const c of skipped) console.log(`  ⚠ ${c.name}: Grade Number "${c.cert}" isn't a PCGS cert number — skipped.`);
  if (DRY_RUN) {
    for (const c of todo) console.log(`  • ${c.isDraft ? 'draft' : 'live '}  ${c.name}  (cert ${c.cert}; ${c.reason})`);
    console.log(`\nAbout ${todo.length * 6} PCGS calls in all (about 6 per coin).`);
    return;
  }

  const cache = loadCache();
  let calls = 0;
  let done = 0;
  let stopReason = null;
  for (const c of todo) {
    let grid;
    try {
      grid = await fetchPopGrid({
        cert: c.cert,
        token: PCGS_API_TOKEN,
        cache,
        onCall: () => { if (calls >= MAX_CALLS) throw new BudgetReached(); calls++; },
      });
    } catch (err) {
      if (err instanceof BudgetReached) { stopReason = `reached --max-calls ${MAX_CALLS}`; break; }
      if (err instanceof PcgsLimitError) { stopReason = 'PCGS says the daily limit is reached'; break; }
      console.log(`  ✗ ${c.name}: ${err.message}`);
      continue;
    } finally {
      cache.save();
    }
    if (!grid) { console.log(`  ✗ ${c.name}: PCGS has no record of cert ${c.cert} — check the Grade Number.`); continue; }

    const { calls: _calls, name: _name, ...rest } = grid;
    const pcgsPop = {
      ...rest,
      v: VERSION,
      cert: c.cert,
      asOf: new Date().toISOString().slice(0, 10),
      cells: rest.cells.map((cell) => ({ _key: `${cell.num}${cell.plus ? 'p' : ''}`, _type: 'pcgsPopCell', ...cell })),
    };
    for (const id of c.ids) await client.patch(id).set({ pcgsPop }).commit();
    done++;
    console.log(`  ✓ ${c.isDraft ? 'draft' : 'live '}  ${c.name} — 1 of ${grid.thisPop} at ${grid.grade}, ${grid.thisHigher} higher`);
  }

  const left = todo.length - done;
  console.log(`\nFilled ${done} listing(s) with ${calls} PCGS call(s).`);
  if (left) {
    console.log(`${left} still to do${stopReason ? ` — stopped because ${stopReason}` : ''}. Run this again tomorrow; it picks up where it left off.`);
  } else {
    console.log('All unsold PCGS listings have population. ✔');
  }
}

main().catch((err) => {
  console.error(`\n✗ ${err.message}`);
  process.exitCode = 1;
});
