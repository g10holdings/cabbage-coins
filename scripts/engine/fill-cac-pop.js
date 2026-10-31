/**
 * Fill in CAC population (±2 grades, Stickered and CACG rows) on unsold CAC listings.
 *
 * One CAC call per coin. CAC's /pops wants CAC's own catalog number (it calls it gsId, but it is the cacId, NOT the
 * GSID shown on the marketplace: those numbers point at a different coin). Where that number comes from:
 *   - CACG holders: the cert lookup gives it directly;
 *   - stickered PCGS/NGC coins: cac-catalog.json (PCGS # -> CAC catalog #). The API can't look this up from a
 *     sticker's cert, so a coin that isn't in the file is listed on screen and simply shows no CAC box.
 *
 * Safety check: a coin must be counted in its own population. If it isn't, the catalog number is wrong: the coin is
 * reported and nothing is saved for it.
 *
 * CAC doesn't split stickered coins by plus grade: a stickered MS66+ is counted under MS66, so that's what's shown.
 * CACG counts do have plus grades.
 *
 * Usage:
 *   node fill-cac-pop.js [flags]
 *
 * Flags:
 *   --dry-run          Show what would be saved; no writes (CAC is still asked).
 *   --refresh-days N   Re-fetch populations older than N days (default 30).
 *
 * After a fill the website needs a build to show it. Env (scripts/engine/.env): SANITY_WRITE_TOKEN, CAC_API_KEY, CAC_API_TOKEN.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { createClient } from '@sanity/client';
import { parseGrade, gradeLabel, SHELDON } from './pcgs-pop.js';
import { settings } from './settings.js';
import { workbookSales } from './sold.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const i = args.indexOf('--refresh-days');
const REFRESH_DAYS = i >= 0 && Number.isFinite(Number(args[i + 1])) ? Number(args[i + 1]) : 30;
const DAY = 24 * 3600_000;
const VERSION = 1;
const STEPS = 2;
const API = 'https://api.cacgrading.com';
const CATALOG = JSON.parse(fs.readFileSync(path.join(__dirname, 'cac-catalog.json'), 'utf8'));

const baseId = (id) => id.replace(/^drafts\./, '');
const certOf = (doc) => String(doc.gradenumber ?? '').trim().replace(/_\d+$/, '').replace(/\D/g, '');
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// CAC allows one call a second.
let lastCall = 0;
async function cac(route) {
  await pause(Math.max(0, lastCall + 1100 - Date.now()));
  lastCall = Date.now();
  const res = await fetch(`${API}${route}`, {
    headers: { 'X-API-KEY': process.env.CAC_API_KEY, 'X-API-TOKEN': process.env.CAC_API_TOKEN, Accept: 'application/json' },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`CAC refused ${route.split('?')[0]} (${res.status}).`);
  return res.json();
}

function needsPop(doc) {
  const p = doc.cacPop;
  if (!p?.cells?.length) return 'missing';
  if (p.v !== VERSION) return 'saved by an older version';
  if (p.cert !== certOf(doc)) return 'cert changed';
  if (Date.now() - Date.parse(p.asOf) > REFRESH_DAYS * DAY) return `older than ${REFRESH_DAYS} days`;
  return null;
}

/** "MS65 BN CAC" -> "BN"; "PR62CAM CAC" -> "CAM". */
const suffixOf = (grade) => String(grade ?? '').replace(/\b(CAC|CACG|OGH)\b/g, '')
  .replace(/^\s*[A-Z]{1,2}\s*-?\d{1,2}\+?/i, '').replace(/\s+/g, '').toUpperCase();

/** @returns {{popFields: object}|{problem: string}} */
function buildPop(c, rows) {
  const g = parseGrade(c.grade);
  if (!g || !SHELDON.includes(g.num)) return { problem: `can't read the grade "${c.grade}"` };
  const held = c.isCacg ? 'cacg' : 'stickered';
  const row = (key) => rows.find((r) => r.grade === key) ?? { stickered: 0, graded: 0, higherStickered: 0, higherGraded: 0 };
  const plain = String(g.num);
  const mine = row(held === 'cacg' && g.plus ? `${plain}+` : plain);
  const count = held === 'cacg' ? mine.graded : mine.stickered;
  if (count < 1) return { problem: `CAC counts 0 ${held} at ${g.num}, so catalog # ${c.cacId} looks wrong; not saved` };

  const at = SHELDON.indexOf(g.num);
  const cells = [];
  for (const num of SHELDON.slice(Math.max(0, at - STEPS), at + STEPS + 1)) {
    const r = row(String(num));
    const isThis = num === g.num && !(held === 'cacg' && g.plus);
    cells.push({ _key: String(num), _type: 'cacPopCell', label: gradeLabel(g.prefix, num, false), num, stickered: r.stickered, graded: r.graded, isThisGrade: isThis });
    if (num === g.num && held === 'cacg' && g.plus) {
      const p = row(`${num}+`);
      cells.push({ _key: `${num}p`, _type: 'cacPopCell', label: gradeLabel(g.prefix, num, true), num, stickered: p.stickered, graded: p.graded, isThisGrade: true });
    }
  }
  return {
    popFields: {
      v: VERSION,
      asOf: new Date().toISOString().slice(0, 10),
      cert: c.cert,
      gsId: c.cacId,
      grade: gradeLabel(g.prefix, g.num, held === 'cacg' && g.plus) + suffixOf(c.grade),
      held,
      thisStickered: mine.stickered,
      higherStickered: mine.higherStickered,
      thisGraded: mine.graded,
      higherGraded: mine.higherGraded,
      cells,
    },
  };
}

async function main() {
  const { SANITY_WRITE_TOKEN, CAC_API_KEY, CAC_API_TOKEN } = process.env;
  if (!SANITY_WRITE_TOKEN) throw new Error('SANITY_WRITE_TOKEN is missing from scripts/engine/.env');
  if (!CAC_API_KEY || !CAC_API_TOKEN) throw new Error('CAC_API_KEY / CAC_API_TOKEN are missing from scripts/engine/.env');

  const client = createClient({
    projectId: settings.sanity.projectId,
    dataset: settings.sanity.dataset,
    apiVersion: settings.sanity.apiVersion,
    token: SANITY_WRITE_TOKEN,
    useCdn: false,
    perspective: 'raw',
  });

  const soldInWorkbook = workbookSales();
  const docs = (await client.fetch(
    `*[_type == "listing" && sold != true && (cac == true || gradingCompany == "CACG") && defined(gradenumber)]
      {_id, name, grade, gradenumber, gradingCompany, pcgsCatalogNumber, pcgsDesignationNumber, cacPop}`,
  )).filter((d) => !soldInWorkbook(d));

  // One coin per listing, whether it exists as a draft, a published doc, or both (both get written).
  const coins = new Map();
  for (const d of docs) {
    const c = coins.get(baseId(d._id)) ?? { ids: [], reason: null };
    c.ids.push(d._id);
    c.name = d.name;
    c.grade = d.grade;
    c.cert = certOf(d);
    c.isCacg = d.gradingCompany === 'CACG';
    c.pcgs = d.pcgsDesignationNumber ?? d.pcgsCatalogNumber;
    c.reason ??= needsPop(d);
    coins.set(baseId(d._id), c);
  }
  const todo = [...coins.values()].filter((c) => c.reason);

  console.log(`CAC population: ${coins.size} unsold CAC coin(s), ${todo.length} to fill${DRY_RUN ? '  [DRY RUN]' : ''}.\n`);
  let done = 0;
  const waiting = [];
  const problems = [];
  for (const c of todo) {
    if (c.isCacg) {
      c.cacId = (await cac(`/certs/${c.cert}`))?.data?.cacId;
      if (!c.cacId) { problems.push(`${c.name}: CAC has no record of cert ${c.cert}`); continue; }
    } else {
      c.cacId = CATALOG[String(c.pcgs)];
      if (!c.cacId) { waiting.push(c.name); continue; }
    }
    const rows = (await cac(`/pops?gsId=${c.cacId}`))?.data ?? [];
    const { popFields, problem } = buildPop(c, rows);
    if (problem) { problems.push(`${c.name}: ${problem}`); continue; }
    if (!DRY_RUN) for (const id of c.ids) await client.patch(id).set({ cacPop: popFields }).commit();
    done++;
    const n = c.isCacg ? `1 of ${popFields.thisGraded} CACG` : `1 of ${popFields.thisStickered} stickered`;
    const high = c.isCacg ? popFields.higherGraded : popFields.higherStickered;
    console.log(`  ✓ ${c.name} — ${n} at ${popFields.grade}, ${high} higher  [${popFields.cells.map((x) => `${x.label} ${x.stickered}/${x.graded}`).join('  ')}]`);
  }

  console.log(`\n${DRY_RUN ? 'Would fill' : 'Filled'} ${done} coin(s).`);
  if (problems.length) {
    console.log(`\nNot saved (${problems.length}):`);
    for (const p of problems) console.log(`  ✗ ${p}`);
  }
  if (waiting.length) {
    console.log(`\nNo CAC catalog # yet, so no CAC box (${waiting.length}):`);
    for (const n of waiting) console.log(`  - ${n}`);
  }
}

main().catch((err) => {
  console.error(`\n✗ ${err.message}`);
  process.exitCode = 1;
});
