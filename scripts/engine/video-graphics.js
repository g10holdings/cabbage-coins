/**
 * Name banners ("lower thirds") for the YouTube new-inventory videos: one transparent PNG per coin,
 * styled like the host banner: logo badge on the left, the coin's short name where the host's name goes,
 * the price where "HOST" goes, the grade under it, and the email + website along the bottom.
 *
 *   node video-graphics.js              lists the coins and asks which are in this video
 *   node video-graphics.js 13798817 …   just these certs, no question
 *
 * The list is the website's coins for sale (newest first), then the workbook's Website = R coins that
 * aren't on the website yet. Price and grade come from the website listing, or the workbook for the others.
 *
 * Each PNG is 3840×2160 (4K) and transparent except for the banner (top left, clear of subtitles), so it drops straight onto
 * the video timeline over the footage. Written to "videoGraphics.folder" in settings.json, in a folder
 * named for today's date.
 *
 * The short name is made from the listing name (denomination code, grading company, grade, pedigree and
 * notes in brackets dropped). To word one differently, add it to video-titles.json by cert:
 *   "13798817": { "title": "1837 Capped Bust Half Dime", "subtitle": "PCGS MS65 CAC" }
 *
 * Drawn by Microsoft Edge in headless mode (already on every Windows PC). Reads the website and the
 * workbook; changes nothing in either.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawn, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import readline from 'node:readline/promises';
import { ENGINE, sanity } from './settings.js';
import { readInventory, certKey, nameKey, hasCert, gradeOf, denominationOf } from './workbook.js';

const raw = JSON.parse(fs.readFileSync(path.join(ENGINE, 'settings.json'), 'utf8'));
const vg = raw.videoGraphics ?? {};
const OUT_ROOT = path.resolve(ENGINE, vg.folder ?? 'D:/OneDrive/Cabbage Coins/Video Graphics');
const EMAIL = vg.email ?? 'tony@cabbagecoins.com';
const WEBSITE = vg.website ?? 'cabbagecoins.com';
const HEAD = path.resolve(ENGINE, vg.logo ?? 'D:/OneDrive/Cabbage Coins/Logo/CabbageCoins_Main_White.png');
const TITLES = path.join(ENGINE, 'video-titles.json');

const EDGE = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find((p) => fs.existsSync(p));

const str = (v) => (v == null ? '' : String(v).trim());
const COMPANY_CUT = /\s+(?:PCGS|NGC|CACG|CAC|ANACS|ICG)\b.*$/;

/** "1898-O 25C Barber Quarter Dollar PCGS MS64 CAC" -> "1898-O Barber Quarter". */
export function shortName(description) {
  let s = str(description).replace(/\([^)]*\)/g, ' ').replace(COMPANY_CUT, '');
  const denom = denominationOf(description);
  if (denom && denom !== 'Peso') {
    const w = s.split(/\s+/);
    const k = w.findIndex((x, i) => i > 0 && x.replace(/\$(\d+)\.5$/, '$$$1.50') === denom);
    if (k > 0) w.splice(k, 1);
    s = w.join(' ');
  }
  s = s
    .replace(/\bQuarter Dollar\b/, 'Quarter')
    .replace(/\bSilver Dollar\b/, 'Dollar')
    .replace(/\bU\.?S\.? (?=Trade|Philippines)/, '')
    .replace(/\bPeso US Philippines Peso\b/, 'Philippines Peso')
    .replace(/\s*#\S+$/, '')   // ingot serial numbers
    .replace(/\s+/g, ' ')
    .trim();
  return s;
}

/** "PCGS MS64 CAC"; blank for raw items like the ingots. */
function subtitleOf(company, grade) {
  company = str(company);
  grade = str(grade);
  if (!grade || /^n\/?a$/i.test(grade)) return '';
  if (company === 'CACG') return `CACG ${grade.replace(/ CAC$/, '')}`;   // a CACG holder is CAC already
  return /^(n\/?a|ungraded|)$/i.test(company) ? grade : `${company} ${grade}`;
}

const price = (v) => (Number(v) > 0 ? `$${Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 })}` : '');
const esc = (s) => str(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const slug = (s) => str(s).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

/**
 * Everything that could be in a video: the website's coins for sale (newest first), then the workbook's
 * Website = R coins that aren't on the website yet. Each: { cert, name, company, grade, price, onSite }.
 */
async function candidates() {
  const listings = await sanity().fetch(`*[_type == "listing" && !(_id in path("drafts.**")) && sold != true]
    | order(_createdAt desc){name, price, grade, gradenumber, gradingCompany}`);
  const coins = listings.map((l) => ({ cert: str(l.gradenumber), name: l.name, company: l.gradingCompany, grade: l.grade, price: l.price, onSite: true }));
  const onSite = new Set(listings.flatMap((l) => [certKey(l.gradenumber), nameKey(l.name)]));
  for (const r of readInventory().rows) {
    if (!/^active$/i.test(str(r.Status)) || !/^R$/i.test(str(r.Website))) continue;
    if (onSite.has(hasCert(r.inventoryID) && hasCert(r.Certification) ? certKey(r.inventoryID) : nameKey(r.itemDescription))) continue;
    const company = str(r.Certification);
    coins.push({ cert: certKey(r.inventoryID), name: r.itemDescription, company, grade: gradeOf(r.itemDescription, { cac: r.CAC, company }), price: r.listPrice, onSite: false });
  }
  return coins;
}

/** "1 4 7-10" -> [1, 4, 7, 8, 9, 10]; null if anything in it isn't a number or range. */
export function parsePicks(answer, max) {
  const out = [];
  for (const part of str(answer).split(/[\s,]+/).filter(Boolean)) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(part);
    if (!m) return null;
    const [a, b] = [Number(m[1]), Number(m[2] ?? m[1])];
    if (a < 1 || b > max || a > b) return null;
    for (let n = a; n <= b; n++) if (!out.includes(n)) out.push(n);
  }
  return out;
}

/** Shows the numbered list and asks which ones. Certs given on the command line skip the question. */
/**
 * The banner's words for each coin: title, subtitle and price, from video-titles.json where you've
 * written your own (keyed by cert, or by the full listing name for items with no cert), else made here.
 */
function withWording(coins) {
  const raw = fs.existsSync(TITLES) ? JSON.parse(fs.readFileSync(TITLES, 'utf8')) : {};
  const own = new Map(Object.entries(raw).flatMap(([k, v]) => [[certKey(k), v], [nameKey(k), v]]));
  return coins.map((c) => {
    const o = (hasCert(c.cert) && own.get(certKey(c.cert))) || own.get(nameKey(c.name)) || {};
    return {
      ...c,
      title: o.title ?? shortName(c.name),
      subtitle: o.subtitle ?? subtitleOf(c.company, c.grade),
      price: o.price ?? price(c.price),
    };
  });
}

async function choose(coins, args) {
  const ids = args.filter((a) => !a.startsWith('--')).map(certKey);
  if (ids.length) return coins.filter((c) => ids.includes(certKey(c.cert)));
  const w = String(coins.length).length;
  coins.forEach((c, i) => {
    const where = c.onSite ? '' : '   (not on website yet)';
    console.log(`  ${String(i + 1).padStart(w)}. ${c.title.padEnd(42)} ${c.price.padStart(8)}   ${c.subtitle}${where}`);
  });
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    for (;;) {
      const answer = await rl.question('\nWhich coins are in this video? Numbers, e.g. 1 4 7-10 (Enter = none): ');
      if (!answer.trim()) return [];
      const picks = parsePicks(answer, coins.length);
      if (picks) return picks.map((n) => coins[n - 1]);
      console.log(`  Use numbers from 1 to ${coins.length}, with spaces, commas or ranges like 7-10.`);
    }
  } finally {
    rl.close();
  }
}

// ---------------------------------------------------------------------------
// The banner
// ---------------------------------------------------------------------------

const ICON_MAIL = '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.5 6.5 12 13l8.5-6.5"/></svg>';
const ICON_WEB = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.6 3.9 5.6 3.9 9s-1.3 6.4-3.9 9c-2.6-2.6-3.9-5.6-3.9-9S9.4 5.6 12 3z"/></svg>';

/** The white-lettered logo (CabbageCoins_Main_White.png) on a black disk with a gold rim. */
function badge() {
  return `<svg class="badge" viewBox="0 0 200 200">
    <circle cx="100" cy="100" r="96" fill="#0b0b0b" stroke="#c9a253" stroke-width="6"/>
    <image href="${pathToFileURL(HEAD).href}" x="12" y="12" width="176" height="176"/>
  </svg>`;
}

function page(coins) {
  return `<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@500;700;800&display=block" rel="stylesheet">
<style>
  html, body { margin: 0; width: 1920px; height: 1080px; background: transparent; overflow: hidden; }
  .wrap { position: absolute; left: 90px; top: 90px; display: flex; align-items: center; font-family: Montserrat, 'Segoe UI', sans-serif; }
  .badge { width: 236px; height: 236px; position: relative; z-index: 2; filter: drop-shadow(0 4px 10px rgba(0,0,0,.45)); }
  .bar { margin-left: -60px; padding: 22px 40px 20px 92px; min-width: 760px; max-width: 1440px; box-sizing: border-box;
         background: linear-gradient(180deg, rgba(24,24,24,.94), rgba(12,12,12,.94)); border-radius: 0 14px 14px 0;
         position: relative; box-shadow: 0 6px 20px rgba(0,0,0,.4); }
  .bar::before { content: ''; position: absolute; left: 66px; top: 0; bottom: 0; width: 9px; background: #c9a253; transform: skewX(-8deg); }
  .top { display: flex; align-items: center; gap: 22px; white-space: nowrap; }
  .title { color: #fff; font-weight: 800; font-size: 54px; line-height: 1.05; text-transform: uppercase; letter-spacing: .5px; }
  .sep { width: 3px; height: 46px; background: #8a8a8a; flex: none; }
  .price { color: #d6b264; font-weight: 700; font-size: 50px; letter-spacing: 1px; flex: none; }
  .sub { color: #d6b264; font-weight: 500; font-size: 33px; margin-top: 6px; min-height: 8px; }
  .rule { height: 2px; background: linear-gradient(90deg, #c9a253, rgba(201,162,83,.25)); margin: 14px 0 12px; }
  .contact { display: flex; align-items: center; gap: 26px; color: #fff; font-weight: 500; font-size: 29px; }
  .contact span { display: flex; align-items: center; gap: 12px; }
  .contact svg { width: 32px; height: 32px; fill: none; stroke: #d6b264; stroke-width: 1.8; stroke-linejoin: round; }
  .contact .sep { height: 32px; width: 2px; }
</style></head><body>
<div class="wrap">${badge()}
  <div class="bar">
    <div class="top"><div class="title" id="t"></div><div class="sep"></div><div class="price" id="p"></div></div>
    <div class="sub" id="s"></div>
    <div class="rule"></div>
    <div class="contact"><span>${ICON_MAIL}${esc(EMAIL)}</span><div class="sep"></div><span>${ICON_WEB}${esc(WEBSITE)}</span></div>
  </div>
</div>
<script>
  const coins = ${JSON.stringify(coins)};
  const c = coins[Number(new URLSearchParams(location.search).get('i')) || 0];
  t.textContent = c.title; p.textContent = c.price; s.textContent = c.subtitle;
  if (!c.price) p.previousElementSibling.style.display = 'none';
  // A long name shrinks to fit rather than running off the bar.
  // Measured once the web font is in, since it's wider than the stand-in.
  const line = document.querySelector('.top');
  document.fonts.ready.then(() => {
    for (let size = 54; line.scrollWidth > line.clientWidth && size > 30; size--) t.style.fontSize = size + 'px';
  });
</script></body></html>`;
}

function render(html, i, out, profile) {
  const url = `${pathToFileURL(html).href}?i=${i}`;
  const r = spawnSync(EDGE, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--allow-file-access-from-files',
    `--user-data-dir=${profile}`, '--default-background-color=00000000', '--window-size=1920,1080', '--force-device-scale-factor=2',   // laid out at 1080p, drawn at 4K
    '--virtual-time-budget=6000', `--screenshot=${out}`, url,
  ], { encoding: 'utf8', timeout: 60000 });
  if (!fs.existsSync(out)) throw new Error(`Edge didn't make ${path.basename(out)}: ${r.stderr || r.error || 'no output'}`);
}

async function main() {
  if (!EDGE) { console.error('Microsoft Edge was not found, and it is what draws the graphics.'); process.exit(1); }
  if (!fs.existsSync(HEAD)) { console.error(`Logo not found: ${HEAD} (videoGraphics.logo in settings.json)`); process.exit(1); }
  const args = process.argv.slice(2);
  const coins = await choose(withWording(await candidates()), args);
  if (!coins.length) { console.log('No coins picked; nothing made.'); return; }

  const day = new Date().toLocaleDateString('en-CA');
  const outDir = path.join(OUT_ROOT, day);
  fs.mkdirSync(outDir, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cabbage-video-'));
  const html = path.join(tmp, 'banner.html');
  fs.writeFileSync(html, page(coins));

  console.log(`\nMaking ${coins.length} graphic(s) in ${outDir}\n`);
  try {
    coins.forEach((c, i) => {
      const file = path.join(outDir, `${String(i + 1).padStart(2, '0')}-${slug(c.title)}.png`);
      render(html, i, file, path.join(tmp, 'edge'));
      console.log(`  ${path.basename(file)}   ${c.title}  |  ${c.price}  |  ${c.subtitle}`);
    });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log(`\nDone. To reword a name, add it to engine\\video-titles.json and run again.`);
  if (!args.includes('--no-open')) spawn('explorer.exe', [outDir], { detached: true, stdio: 'ignore' }).unref();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
