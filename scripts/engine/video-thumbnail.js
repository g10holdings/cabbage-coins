/**
 * The YouTube thumbnail: the last step of video-graphics.js (Tony, 2026-10-19).
 *
 * You give the words ("PAN Show" / "Inventory Preview" / "Oct 2026") and pick 3 slab shots and 3 obverse
 * close-ups from the coins in the video. It then makes several thumbnails at once, each in a different color
 * theme and layout, so every video can look different. The looks already shown are remembered in
 * .thumbnail-history.json, and the next video gets the ones used least.
 *
 * Photos: the website's (the first close-up and the first slab in the listing's order are the obverses, checked
 * on all 87 listings, 2026-10-19), else the prepped -2 (close-up) and -1 (slab) in waiting_website.
 * 1280×720 JPEG, drawn by Edge at twice the size and scaled down, so it stays sharp.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { ENGINE } from './settings.js';
import { isCloseUp } from './photo-order.js';
import { photoFolders, findPhotos } from './listing-photos.js';

const HISTORY = path.join(ENGINE, '.thumbnail-history.json');
const COIN_PILE = 'D:/OneDrive/Cabbage Coins/Logo/Coins_BG_3b (1).jpg';
const PER_RUN = 4;

export const EDGE = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find((p) => fs.existsSync(p));

/** Edge draws the page and saves a PNG. `scale` 2 doubles the pixels without changing the layout. */
export function screenshot(url, out, profile, { width, height, scale = 1, transparent = false }) {
  fs.rmSync(out, { force: true });   // so a failed draw can't pass for the old file
  const r = spawnSync(EDGE, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--allow-file-access-from-files',
    `--user-data-dir=${profile}`, `--window-size=${width},${height}`, `--force-device-scale-factor=${scale}`,
    ...(transparent ? ['--default-background-color=00000000'] : []),
    '--virtual-time-budget=6000', `--screenshot=${out}`, url,
  ], { encoding: 'utf8', timeout: 60000 });
  if (!fs.existsSync(out)) throw new Error(`Edge didn't make ${path.basename(out)}: ${r.stderr || r.error || 'no output'}`);
}

/** Halves a PNG into a quality-92 JPEG (Windows' own image library). */
function toJpeg(png, jpg, width, height) {
  const q = (s) => `'${s.replace(/'/g, "''")}'`;
  const ps = `Add-Type -AssemblyName System.Drawing;
    $src=[System.Drawing.Image]::FromFile(${q(png)}); $bmp=New-Object System.Drawing.Bitmap ${width},${height};
    $g=[System.Drawing.Graphics]::FromImage($bmp); $g.InterpolationMode='HighQualityBicubic'; $g.DrawImage($src,0,0,${width},${height});
    $codec=[System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' };
    $ep=New-Object System.Drawing.Imaging.EncoderParameters(1);
    $ep.Param[0]=[System.Drawing.Imaging.EncoderParameter]::new([System.Drawing.Imaging.Encoder]::Quality, [long]92);
    $bmp.Save(${q(jpg)},$codec,$ep); $g.Dispose(); $src.Dispose(); $bmp.Dispose()`;
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { encoding: 'utf8' });
  if (!fs.existsSync(jpg)) throw new Error(`Couldn't save ${path.basename(jpg)}: ${r.stderr}`);
}

// ---------------------------------------------------------------------------
// Looks: color themes x layouts. Add a theme by copying one; every key is used.
// ---------------------------------------------------------------------------

const RAYS = (c) => `repeating-conic-gradient(from 0deg at 75% 50%, ${c} 0 6deg, transparent 6deg 14deg)`;
const STRIPES = (c) => `repeating-linear-gradient(135deg, ${c} 0 2px, transparent 2px 26px)`;
const DOTS = (c) => `radial-gradient(${c} 1.6px, transparent 1.8px) 0 0 / 22px 22px`;
const BRUSHED = (c) => `repeating-linear-gradient(0deg, ${c} 0 1px, transparent 1px 5px)`;

export const THEMES = {
  'black-gold':   { bg: ['#3a2e14', '#17130b', '#070707'], pattern: RAYS('rgba(214,178,100,.05)'), accent: '#d6b264', tagText: '#111', big: ['#f7dc8f', '#d6b264', '#a87a2a'], text: '#fff', font: 'Montserrat', weight: 900 },
  'navy-gold':    { bg: ['#1f4178', '#0d1d3a', '#040a17'], pattern: STRIPES('rgba(255,255,255,.035)'), accent: '#e3b75a', tagText: '#0d1d3a', big: ['#ffe8a6', '#e3b75a', '#b07f2c'], text: '#fff', font: 'Oswald', weight: 700 },
  'emerald-gold': { bg: ['#226b45', '#0e2f1f', '#04120b'], pattern: DOTS('rgba(233,196,106,.10)'), accent: '#e9c46a', tagText: '#0e2f1f', big: ['#fff3c0', '#e9c46a', '#b8862f'], text: '#f1f7f3', font: 'Playfair Display', weight: 900 },
  'burgundy':     { bg: ['#7a2233', '#3d0e18', '#150409'], pattern: RAYS('rgba(255,230,190,.04)'), accent: '#f0d9a8', tagText: '#3d0e18', big: ['#fff8e6', '#f0d9a8', '#cf9f55'], text: '#fff', font: 'Bebas Neue', weight: 400 },
  'silver-red':   { bg: ['#565c66', '#272a30', '#0b0c0e'], pattern: BRUSHED('rgba(255,255,255,.025)'), accent: '#d7263d', tagText: '#fff', big: ['#ffffff', '#d9dee5', '#9aa3ae'], text: '#fff', font: 'Archivo Black', weight: 400 },
  'ivory':        { bg: ['#fffaf0', '#f1e6cb', '#d8c59a'], pattern: RAYS('rgba(120,84,16,.05)'), accent: '#b8862f', tagText: '#fff', big: ['#3a3a3a', '#1a1a1a', '#000'], text: '#7a5410', font: 'Playfair Display', weight: 900, light: true },
  'royal-purple': { bg: ['#55308a', '#24113f', '#0b0514'], pattern: DOTS('rgba(242,193,78,.10)'), accent: '#f2c14e', tagText: '#24113f', big: ['#ffeaa8', '#f2c14e', '#c48a26'], text: '#fff', font: 'Montserrat', weight: 900 },
  'teal-copper':  { bg: ['#16707a', '#0a3439', '#031416'], pattern: STRIPES('rgba(255,255,255,.03)'), accent: '#e08a4f', tagText: '#fff', big: ['#ffe0c4', '#f0a46d', '#c4652c'], text: '#fff', font: 'Oswald', weight: 700 },
  'coin-pile':    { bg: ['rgba(20,16,8,.55)', 'rgba(8,7,4,.80)', 'rgba(0,0,0,.92)'], photo: COIN_PILE, pattern: 'none', accent: '#d6b264', tagText: '#111', big: ['#fff1c2', '#e7c272', '#b48434'], text: '#fff', font: 'Archivo Black', weight: 400 },
};

const FONTS = 'family=Montserrat:wght@800;900&family=Oswald:wght@600;700&family=Playfair+Display:wght@900&family=Bebas+Neue&family=Archivo+Black';

/**
 * Each layout places: the title block (box), the 3 slabs (s0-s2) and the 3 close-ups (c0 = the big one, c1, c2).
 * Positions are [left, top, size, turn]; a slab's size is its width (height = 1.28 × width).
 */
export const LAYOUTS = {
  'fan-right': { box: [56, 60, 540, 600], s: [[580, 40, 250, -9], [790, 18, 250, 0], [990, 40, 250, 9]], c: [[756, 318, 330], [566, 392, 236], [1022, 392, 236]] },
  'fan-left':  { box: [700, 60, 540, 600], s: [[20, 40, 250, -9], [230, 18, 250, 0], [430, 40, 250, 9]], c: [[196, 318, 330], [6, 392, 236], [462, 392, 236]] },
  // One row along the bottom: slab, close-up, slab, BIG close-up, slab (the third close-up has no room).
  'title-top': { box: [56, 24, 1168, 290], wide: true, s: [[80, 375, 205, -5], [470, 345, 205, 0], [990, 375, 205, 5]], c: [[660, 325, 340], [265, 430, 220], [0, 0, 0]] },
  'spotlight': { box: [56, 50, 640, 400], s: [[44, 470, 146, -4], [320, 470, 146, 0], [596, 470, 146, 4]], c: [[740, 70, 600], [180, 522, 150], [456, 522, 150]] },
};

function page({ theme, layout, words, photos, logo }) {
  const t = THEMES[theme], L = LAYOUTS[layout];
  const img = (f) => pathToFileURL(f).href;
  const slabs = L.s.map(([x, y, w, r], i) => photos.slabs[i] ? `<div class="slab" style="left:${x}px;top:${y}px;width:${w}px;height:${Math.round(w * 1.28)}px;transform:rotate(${r}deg)"><img src="${img(photos.slabs[i])}"></div>` : '').join('');
  const coins = L.c.map(([x, y, d], i) => d && photos.closes[i] ? `<div class="coin" style="left:${x}px;top:${y}px;width:${d}px;height:${d}px;z-index:${i ? 3 : 4}"><img src="${img(photos.closes[i])}"></div>` : '').join('');
  const [bx, by, bw, bh] = L.box;
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  return `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?${FONTS}&display=block" rel="stylesheet">
<style>
  html, body { margin: 0; width: 1280px; height: 720px; overflow: hidden; }
  body { position: relative; font-family: Montserrat, sans-serif;
    background: radial-gradient(ellipse 75% 95% at 72% 50%, ${t.bg[0]} 0%, ${t.bg[1]} 48%, ${t.bg[2]} 100%)${t.photo ? `, url("${img(t.photo)}") center / cover` : ''}; }
  body::before { content: ''; position: absolute; inset: 0; background: ${t.pattern}; }
  .box { position: absolute; left: ${bx}px; top: ${by}px; width: ${bw}px; height: ${bh}px; z-index: 6;
    display: flex; flex-direction: column; justify-content: center; ${L.wide ? 'align-items: center; text-align: center;' : ''} }
  .brand { display: flex; align-items: center; gap: 14px; margin-bottom: 14px; }
  .brand svg { width: 70px; height: 70px; flex: none; filter: drop-shadow(0 3px 8px rgba(0,0,0,.5)); }
  .brand span { color: ${t.light ? '#1a1a1a' : '#fff'}; font: 800 24px Montserrat, sans-serif; letter-spacing: 4px; }
  .big { font-family: '${t.font}', sans-serif; font-weight: ${t.weight}; text-transform: uppercase; line-height: .92; font-size: 160px;
    background: linear-gradient(180deg, ${t.big.join(', ')}); -webkit-background-clip: text; background-clip: text; color: transparent;
    filter: drop-shadow(0 5px 0 ${t.light ? 'rgba(120,84,16,.25)' : 'rgba(0,0,0,.55)'}); padding-bottom: 6px; }
  .line2 { color: ${t.text}; font-family: '${t.font}', sans-serif; font-weight: ${t.weight}; text-transform: uppercase; font-size: 64px; line-height: 1.02;
    margin-top: 6px; text-shadow: 0 4px 0 ${t.light ? 'rgba(0,0,0,.08)' : 'rgba(0,0,0,.6)'}; }
  .row { display: flex; align-items: center; gap: 22px; flex-wrap: wrap; ${L.wide ? 'justify-content: center;' : ''} }
  .tag { align-self: ${L.wide ? 'center' : 'flex-start'}; margin-top: 18px; background: ${t.accent}; color: ${t.tagText}; font: 900 38px Montserrat, sans-serif;
    padding: 8px 22px 6px; border-radius: 8px; letter-spacing: 1px; text-transform: uppercase; box-shadow: 0 6px 14px rgba(0,0,0,.45); }
  .wide .tag { margin-top: 8px; }
  .slab { position: absolute; border-radius: 10px; overflow: hidden; box-shadow: 0 14px 30px rgba(0,0,0,.65); background: #000; z-index: 2; }
  .slab img { width: 100%; height: 100%; object-fit: cover; transform: scale(1.02); }
  .coin { position: absolute; border-radius: 50%; overflow: hidden; background: #000; box-shadow: 0 16px 34px rgba(0,0,0,.7), 0 0 0 5px ${t.accent}; }
  .coin img { width: 116%; height: 116%; margin: -8%; display: block; }
</style></head><body>
<div class="box ${L.wide ? 'wide' : ''}">
  <div class="brand"><svg viewBox="0 0 200 200"><circle cx="100" cy="100" r="96" fill="#0b0b0b" stroke="${t.light ? '#b8862f' : '#c9a253'}" stroke-width="7"/>
    <image href="${img(logo)}" x="12" y="12" width="176" height="176"/></svg><span>CABBAGE COINS</span></div>
  <div class="big" id="big">${esc(words.big)}</div>
  ${L.wide
    ? `<div class="row"><div class="line2" id="l2">${esc(words.line2)}</div>${words.tag ? `<div class="tag">${esc(words.tag)}</div>` : ''}</div>`
    : `<div class="line2" id="l2">${esc(words.line2)}</div>${words.tag ? `<div class="tag">${esc(words.tag)}</div>` : ''}`}
</div>
${slabs}${coins}
<script>
  // The words shrink until they fit their box: any event name, any length.
  document.fonts.ready.then(() => {
    const box = document.querySelector('.box'), big = document.getElementById('big'), l2 = document.getElementById('l2');
    const over = () => box.scrollHeight > box.clientHeight + 1 || big.scrollWidth > box.clientWidth + 1 || l2.scrollWidth > box.clientWidth + 1;
    for (let s = 160; over() && s > 40; s -= 4) {
      big.style.fontSize = s + 'px';
      l2.style.fontSize = Math.min(64, Math.round(s * 0.42)) + 'px';
    }
  });
</script></body></html>`;
}

// ---------------------------------------------------------------------------
// Photos
// ---------------------------------------------------------------------------

let saved = 0;

/** { close, slab }: the obverse close-up and slab photo of a coin, saved in `dir`; either may be missing. */
export async function obversePhotos(coin, dir) {
  const save = async (url, name) => {
    const file = path.join(dir, name);
    const res = await fetch(`${url}?w=900&q=90&fm=jpg`);
    if (!res.ok) return null;
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    return file;
  };
  const urls = (coin.photos ?? []).filter(Boolean);
  if (urls.length) {
    const close = await Promise.all(urls.map(isCloseUp));
    const c = urls.find((u, i) => close[i]), s = urls.find((u, i) => !close[i]);
    const key = `${++saved}-${coin.cert.replace(/[^\w-]/g, '_')}`;   // numbered: the ingots all have cert "N/A"
    return { close: c ? await save(c, `${key}-close.jpg`) : null, slab: s ? await save(s, `${key}-slab.jpg`) : null };
  }
  const found = findPhotos(coin.cert, photoFolders());   // not on the website yet: the prepped photos
  if (found?.ready) return { close: found.files[0], slab: found.files[2] };
  return { close: null, slab: null };
}

// ---------------------------------------------------------------------------
// Choosing looks
// ---------------------------------------------------------------------------

function readHistory() {
  try { return JSON.parse(fs.readFileSync(HISTORY, 'utf8')); } catch { return []; }
}

/** PER_RUN looks: themes and layouts used least (and longest ago) first, never two alike in one run. */
export function pickLooks(history, n = PER_RUN, rand = Math.random) {
  const rank = (names, key) => names
    .map((name) => {
      const uses = history.filter((h) => h[key] === name);
      return { name, count: uses.length, last: uses.length ? Math.max(...uses.map((h) => Date.parse(h.date) || 0)) : 0, r: rand() };
    })
    .sort((a, b) => a.count - b.count || a.last - b.last || a.r - b.r)
    .map((x) => x.name);
  const themes = rank(Object.keys(THEMES), 'theme').slice(0, n);
  const layouts = rank(Object.keys(LAYOUTS), 'layout');
  // Pair them up: every way of giving the themes different layouts is tried (24 for 4), and the one with the
  // fewest theme+layout pairings seen before wins.
  const seen = (t, l) => history.filter((h) => h.theme === t && h.layout === l).length;
  const orders = (items, k) => (k === 0 ? [[]] : items.flatMap((x) => orders(items.filter((y) => y !== x), k - 1).map((rest) => [x, ...rest])));
  let best = null, bestCost = Infinity;
  for (const order of orders(layouts, Math.min(themes.length, layouts.length))) {
    const cost = order.reduce((sum, l, i) => sum + seen(themes[i], l), 0);
    if (cost < bestCost) { best = order; bestCost = cost; }
  }
  return themes.map((theme, i) => ({ theme, layout: best[i % best.length] }));
}

/** The default date tag: this month, "Oct 2026". */
export const thisMonth = (d = new Date()) => d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }).replace(',', '');

/**
 * Makes the thumbnails. `photos` = { slabs: [file×3], closes: [file×3] }, where closes[0] is the big one.
 * `words` = { big, line2, tag }. Returns the files written.
 */
export async function makeThumbnails({ words, photos, outDir, tmp, logo, looks, remember = true }) {
  const dir = path.join(tmp, 'thumb');
  fs.mkdirSync(dir, { recursive: true });
  const history = readHistory();
  const chosen = looks ?? pickLooks(history);
  const stem = `YouTube-Thumbnail-${String(`${words.big} ${words.tag}`).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
  const made = [];
  chosen.forEach((look, i) => {
    const html = path.join(dir, `look-${i}.html`), png = path.join(dir, `look-${i}.png`);
    fs.writeFileSync(html, page({ ...look, words, photos, logo }));
    screenshot(pathToFileURL(html).href, png, path.join(tmp, 'edge'), { width: 1280, height: 720, scale: 2 });
    let jpg = path.join(outDir, `${stem}-${look.theme}-${look.layout}.jpg`);
    for (let k = 2; fs.existsSync(jpg); k++) jpg = path.join(outDir, `${stem}-${look.theme}-${look.layout}-${k}.jpg`);
    toJpeg(png, jpg, 1280, 720);
    made.push(jpg);
  });
  const date = new Date().toISOString().slice(0, 10);
  if (remember) fs.writeFileSync(HISTORY, JSON.stringify([...history, ...chosen.map((l) => ({ ...l, date }))], null, 1));
  return made;
}
