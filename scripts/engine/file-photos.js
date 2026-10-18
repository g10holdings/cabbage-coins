/**
 * Files away each coin's photo folder once the coin moves on (Tony's choice, 2026-10-18):
 *
 *   published  waiting_website -> doneUnsold   the camera shots (originals\) are DELETED; the 4 website photos move
 *   sold       doneUnsold -> doneSOLD          (or straight from waiting_website, raws deleted, if it sold fast)
 *
 * Folders are matched to listings by the cert # at the end of the folder name. A published coin's folder is only
 * filed when its 4 photos are there and the listing has its photos. Anything else in a folder (not the 4 photos,
 * not the camera shots) is moved along with it and named, so nothing unknown is deleted. Drafts are never touched.
 * Paths come from settings.json (photos.inProgress / listed / sold).
 *
 *   node file-photos.js          preview: what would move and what would be deleted
 *   node file-photos.js --ask    preview, then ask (4_After-Publishing-or-Selling)
 *   node file-photos.js --apply  do it without asking
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { photoFolders, splitCert } from './listing-photos.js';
import { settings, sanity } from './settings.js';
import { askYes } from './ask.js';

const args = process.argv.slice(2);
const ASK = args.includes('--ask');
let APPLY = args.includes('--apply');
const { inProgress, listed, sold } = settings.photos;

const mb = (bytes) => `${(bytes / 1048576).toFixed(0)} MB`;
const sizeOf = (p) => (fs.statSync(p).isDirectory() ? fs.readdirSync(p).reduce((t, f) => t + sizeOf(path.join(p, f)), 0) : fs.statSync(p).size);

async function main() {
  const listings = await sanity().fetch(`*[_type == "listing" && !(_id in path("drafts.**")) && defined(gradenumber)]
    {name, sold, gradenumber, "photos": count(coalesce(imagesGallery, [])) + select(defined(image.asset) => 1, 0)}`);
  const certFor = (folder) => listings.find((l) => splitCert(folder, l.gradenumber) != null);

  const moves = [];   // { from, to, del: [paths], extras: [names], name, why }
  for (const folder of photoFolders(inProgress)) {
    const l = certFor(folder);
    if (!l) continue;   // a draft, or not imported yet: stays put
    const dir = path.join(inProgress, folder);
    const base = splitCert(folder, l.gradenumber);
    const four = [1, 2, 3, 4].map((n) => `${base}-${n}.jpg`);
    const files = fs.readdirSync(dir);
    if (!four.every((f) => files.includes(f))) { moves.push({ skip: `${folder}: its 4 photos aren't all there, so it stays` }); continue; }
    if (!l.sold && l.photos < 4) { moves.push({ skip: `${folder}: the listing doesn't have its photos yet, so it stays` }); continue; }
    const del = files.filter((f) => f === 'originals' || /^DSC.*\.jpe?g$/i.test(f)).map((f) => path.join(dir, f));
    const extras = files.filter((f) => !four.includes(f) && f !== 'originals' && !/^DSC.*\.jpe?g$/i.test(f));
    moves.push({ from: dir, to: path.join(l.sold ? sold : listed, folder), del, extras, name: l.name, why: l.sold ? 'sold' : 'published' });
  }
  for (const folder of photoFolders(listed)) {
    const l = certFor(folder);
    if (l?.sold) moves.push({ from: path.join(listed, folder), to: path.join(sold, folder), del: [], extras: [], name: l.name, why: 'sold' });
  }

  const todo = moves.filter((m) => !m.skip);
  const clash = todo.filter((m) => fs.existsSync(m.to));
  console.log('Photo folders');
  if (!todo.length) console.log('  Nothing to file.');
  for (const m of todo) {
    const freed = m.del.reduce((t, p) => t + sizeOf(p), 0);
    console.log(`  ${m.why === 'sold' ? '$' : '→'} ${m.name}`);
    console.log(`      ${path.basename(path.dirname(m.from))} -> ${path.basename(path.dirname(m.to))}${m.del.length ? `, deleting the camera shots (${mb(freed)})` : ''}`);
    if (m.extras.length) console.log(`      also moving (not one of the 4 photos): ${m.extras.join(', ')}`);
    if (clash.includes(m)) console.log(`      ✗ can't: "${path.basename(m.to)}" is already there — sort that out by hand`);
  }
  for (const m of moves.filter((x) => x.skip)) console.log(`  · ${m.skip}`);

  const ok = todo.filter((m) => !clash.includes(m));
  if (!ok.length) return;
  if (!APPLY) {
    if (ASK && await askYes(`\nPhotos: file ${ok.length} folder(s)${ok.some((m) => m.del.length) ? ' and delete their camera shots' : ''}? (y/N) `)) APPLY = true;
    else { console.log(ASK ? '\nNo folders moved.' : '\nPreview only: nothing moved or deleted.'); return; }
  }
  for (const m of ok) {
    for (const p of m.del) fs.rmSync(p, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(m.to), { recursive: true });
    try { fs.renameSync(m.from, m.to); } catch { fs.cpSync(m.from, m.to, { recursive: true }); fs.rmSync(m.from, { recursive: true, force: true }); }
    console.log(`  ✓ ${path.basename(m.to)}`);
  }
  console.log(`\nFiled ${ok.length} folder(s).`);
}

main().catch((err) => {
  console.error(`\n✗ ${err.message}`);
  process.exitCode = 1;
});
