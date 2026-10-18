/**
 * Names each coin's photo folder from the workbook. 1_Prep-Photos runs this first.
 *
 * Tony exports each coin from Lightroom into waiting_website\<any name>-<cert #>. This finds that cert's inventory
 * row and renames the folder "<item description as a file name>-<cert #>". The 4 photos are then named
 * "<item description as a file name>-1.jpg" ... "-4.jpg", so they always match the listing, which matters for search
 * engines. A slip like "Morgan" for a Peace dollar (it happened, 2026-10-18) can't reach the website.
 *
 * Before renaming, it compares what Tony typed with the row:
 *   - A different year, mint mark or grade means the cert # is probably mistyped. That folder is left alone and
 *     flagged.
 *   - A series word the row doesn't have (Morgan vs Peace, Proof) is just corrected, with a note.
 *
 * With --apply it renames, and writes .photo-folders.json for Prep-Photos.ps1: the folders to work on, with each
 * one's file name, cert, CAC flag and workbook name. The workbook is only ever read.
 *
 *   node photo-folders.js                 preview: shows what it would rename, changes nothing
 *   node photo-folders.js --apply         rename, and write the list for Prep-Photos
 *   --root <folder>                       another photo folder (testing)
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import dotenv from 'dotenv';
import { readInventory, listingFromRow } from './workbook.js';
import { PHOTO_ROOT, fileBase, splitCert } from './listing-photos.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const rootIdx = args.indexOf('--root');
const ROOT = rootIdx !== -1 ? args[rootIdx + 1] : PHOTO_ROOT;
const MANIFEST = path.join(__dirname, '.photo-folders.json');
const SKIP = new Set(['on hold', 'waiting to post']);

// Words that name a series: one in Tony's folder name that the workbook's name lacks is worth pointing out.
const SERIES = ['Morgan', 'Peace', 'Trade', 'Seated', 'Barber', 'Walking', 'Franklin', 'Kennedy', 'Mercury', 'Roosevelt',
  'Standing', 'Indian', 'Buffalo', 'Jefferson', 'Lincoln', 'Wheat', 'Capped', 'Draped', 'Flowing', 'Bust', 'Gaudens',
  'Eisenhower', 'Washington', 'Coronet', 'Braided', 'Classic', 'Shield', 'Flying', 'Matron', 'Princess', 'Proof'];

const yearOf = (s) => (/(?:^|\D)(1[5-9]\d\d|20\d\d)(?!\d)/.exec(s) ?? [])[1] ?? null;
// Mint mark straight after the year, in capitals as written: "1934-D", "1869S", "1776-PTS" (not "1913-Ten").
const mintOf = (s) => (/(?:^|\D)(?:1[5-9]\d\d|20\d\d)-?([A-Z]{1,3})(?=[-_ ]|$)/.exec(s) ?? [])[1] ?? null;
const gradeOf = (s) => (/(?:^|[^A-Za-z])(?:MS|PR|PF|SP|AU|XF|EF|VF|VG|AG|FR)[-_ ]?(\d{1,2})(?!\d)/i.exec(s) ?? [])[1] ?? null;

/** What disagrees between Tony's folder name and the workbook row: [blocking problems, notes]. */
export function compare(typed, w) {
  const block = [], notes = [];
  const ty = yearOf(typed), wy = yearOf(w.dateShown || w.name);
  if (ty && wy && ty !== wy) block.push(`year ${ty}, but the workbook says ${wy}`);
  const tm = mintOf(typed), wm = (/-([A-Za-z]+)$/.exec(w.dateShown ?? '') ?? [])[1] ?? null;
  if (ty && tm && wm && tm.toUpperCase() !== wm.toUpperCase()) block.push(`mint ${tm}, but the workbook says ${wm}`);
  if (ty && tm && !wm) block.push(`mint ${tm}, but the workbook has no mint mark`);
  const tg = gradeOf(typed), wg = (/(\d{1,2})/.exec(w.grade ?? '') ?? [])[1] ?? null;
  if (tg && wg && Number(tg) !== Number(wg)) block.push(`grade ${tg}, but the workbook says ${wg}`);
  for (const word of SERIES) {
    const re = new RegExp(`\\b${word}\\b`, 'i');
    if (re.test(typed.replace(/[-_]+/g, ' ')) && !re.test(w.name)) notes.push(`"${word}" isn't in the workbook's name`);
  }
  return [block, notes];
}

function main() {
  if (!fs.existsSync(ROOT)) throw new Error(`photo folder not found: ${ROOT}`);
  const { rows } = readInventory();
  const book = new Map();   // cert key -> workbook listing (a later "_2" row wins)
  for (const r of rows) { const w = listingFromRow(r); if (w.key) book.set(w.key, w); }
  const keys = [...book.keys()].sort((a, b) => b.length - a.length);   // longest first, so 12345 can't steal 812345

  const work = [], problems = [];
  let renamed = 0;
  for (const folder of fs.readdirSync(ROOT, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort()) {
    if (SKIP.has(folder.toLowerCase())) continue;
    const key = keys.find((k) => splitCert(folder, k) != null);
    if (!key) { problems.push(`${folder}\n      no cert # from the workbook at the end of the name: add it, e.g. "${folder}-12345678"`); continue; }
    const w = book.get(key);
    const typed = splitCert(folder, key);
    if (w.status !== 'Active') { problems.push(`${folder}\n      cert ${w.cert} is ${w.status || 'not Active'} in the workbook: ${w.name}`); continue; }
    const [block, notes] = compare(typed, w);
    if (block.length) { problems.push(`${folder}\n      left alone: the name says ${block.join('; ')}. Is cert ${w.cert} right? (workbook: ${w.name})`); continue; }

    if (w.website !== 'R') notes.push(`Website is "${w.website || 'blank'}" in the workbook, not R, so 2_Import-Listings won't list it`);
    const base = fileBase(w.name);
    const target = `${base}-${w.cert}`;
    if (target !== folder) {
      const from = path.join(ROOT, folder), to = path.join(ROOT, target);
      if (fs.existsSync(to) && to.toLowerCase() !== from.toLowerCase()) { problems.push(`${folder}\n      can't rename: "${target}" already exists`); continue; }
      console.log(`  ${folder}\n   -> ${target}${notes.length ? `\n      note: ${notes.join('; ')}: named from the workbook` : ''}`);
      if (APPLY) {
        fs.renameSync(from, to);
        // photos already made under the old name follow the new one
        const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const old = new RegExp(`^(?:${esc(typed)}|${esc(folder)})-([1-4])\\.jpg$`, 'i');
        for (const f of fs.readdirSync(to)) {
          const m = old.exec(f);
          if (m && !fs.existsSync(path.join(to, `${base}-${m[1]}.jpg`))) fs.renameSync(path.join(to, f), path.join(to, `${base}-${m[1]}.jpg`));
        }
      }
      renamed++;
    }
    if (notes.length && target === folder) console.log(`  ${folder}\n      note: ${notes.join('; ')}`);
    work.push({ folder: target, base, cert: w.cert, cac: w.cac, name: w.name });
  }

  console.log(renamed ? `\n${APPLY ? 'Renamed' : 'Would rename'} ${renamed} folder(s) to the workbook's names.` : '\nEvery folder already has its workbook name.');
  if (problems.length) {
    console.log(`\n⚠ ${problems.length} folder(s) skipped:`);
    for (const p of problems) console.log(`  - ${p}`);
  }
  if (APPLY) fs.writeFileSync(MANIFEST, JSON.stringify(work, null, 2));
  else console.log('\nPreview only: nothing renamed. (1_Prep-Photos does the renaming.)');
}

// Run only when started directly (tests import compare without running anything).
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(); } catch (err) { console.error(`\n✗ ${err.message}`); process.exitCode = 1; }
}
