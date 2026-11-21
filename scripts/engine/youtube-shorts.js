/**
 * YouTube Shorts → listings (Extras\YouTube-Shorts). Tony 2026-11-20.
 *
 * Tony films a Short per coin and saves it as <cert>.MP4 in the "ready" folder (settings.json → shorts),
 * marks the coin "R" in the workbook's Video column, and drags the files into YouTube Studio (up to 15 at a
 * time; Studio names each video after its file). This script then, for every Video-R coin:
 *
 *   1. finds its video on the Cabbage Coins channel (title = the file name, or already the finished title),
 *   2. sets the title  "<description without the denomination> - <cert>"  (ingots: no serial, it's in the name),
 *      a description with the coin's own listing link + email, 5–6 tags, Unlisted, and Not made for kids,
 *   3. waits until YouTube has finished processing it (live timer on screen),
 *   4. puts the link in the listing's "YouTube video" field (published, and any open Studio draft too),
 *   5. starts ONE site build, and moves the video files into the "uploaded" folder.
 *
 * Why Tony uploads by hand: Google locks videos uploaded through the API by an unaudited app to Private.
 * Changing a video's details through the API has no such lock.
 *
 * Safe to run again: a listing that already has a YouTube link is skipped (unless --replace), and a video
 * still processing is simply picked up next time. The workbook is only READ: set Video to "Y" yourself.
 *
 *   node youtube-shorts.js          preview only
 *   node youtube-shorts.js --ask    preview, then ask (the launcher)
 *   node youtube-shorts.js --apply  do it without asking
 *   --replace                       also replace links already on a listing
 */

import fs from 'node:fs';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ffmpegPath from 'ffmpeg-static';
import path from 'node:path';
import process from 'node:process';
import readline from 'node:readline';
import { pathToFileURL } from 'node:url';
import slugify from 'slugify';
import { settings, sanity } from './settings.js';
import { readInventory, certKey, nameKey, hasCert, denominationOf } from './workbook.js';
import { startBuild } from './site-sold.js';
import { askYes } from './ask.js';

const SITE = 'https://cabbagecoins.com';
const EMAIL = 'tony@cabbagecoins.com';
const VIDEO_EXT = /\.(mp4|mov|m4v)$/i;
const WAIT_LIMIT_MIN = 60;     // stop waiting for YouTube's processing after this; the rest is picked up next run
const POLL_SEC = 15;

// ---------------------------------------------------------------------------
// The words (pure functions: the tests call them)
// ---------------------------------------------------------------------------

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/** An ingot/bar (or anything with no grading company) carries its own serial in its name: no " - cert" on the title. */
export const isIngot = (row) => /bar|ingot/i.test(String(row.Type ?? '')) || !hasCert(row.Certification);

/** The item description without its denomination word: "1889-CC $1 Morgan …" → "1889-CC Morgan …". */
export function coinName(row) {
  const desc = clean(row.itemDescription);
  const d = denominationOf(desc);
  if (!d) return desc;
  const words = desc.split(' ');
  // denominationOf skips the first word (the date); the site writes "$2.50" where the workbook has "$2.5".
  const i = words.findIndex((w, k) => k > 0 && (w === d || w.replace(/\$(\d+)\.5$/, '$$$1.50') === d));
  if (i < 0) return desc;
  words.splice(i, 1);
  return words.join(' ');
}

/** "1889-CC Morgan Silver Dollar PCGS XF40 - 45673714"; ingots just their name. YouTube allows 100 characters. */
export function videoTitle(row) {
  const name = coinName(row).replace(/[<>]/g, '');
  const tail = isIngot(row) ? '' : ` - ${certKey(row.inventoryID)}`;
  return (name.length + tail.length > 100 ? name.slice(0, 100 - tail.length).trimEnd() : name) + tail;
}

/** The site's own listing address (same rule as the "slug" filter in web/.eleventy.js). */
export function listingUrl(slug) {
  const s = slugify(String(slug).replace('.', '-'), { replacement: '-', remove: /[&,+()$~%.'":*?<>{}]/g, lower: true })
    .replace('dollar', 'usd');
  return `${SITE}/listings/${s}/`;
}

const WORDINGS = [
  (c, u) => `You can find this ${c} on the cabbagecoins.com website:\n${u}\n\nOr just email me directly: ${EMAIL}`,
  (c, u) => `This ${c} is available now at cabbagecoins.com:\n${u}\n\nQuestions? Email me directly at ${EMAIL}`,
  (c, u) => `Want this ${c}? It's listed on the Cabbage Coins website:\n${u}\n\nOr email me directly: ${EMAIL}`,
  (c, u) => `See more photos and the details for this ${c} at cabbagecoins.com:\n${u}\n\nOr reach me directly at ${EMAIL}`,
];

/** One of a few wordings, picked by the cert so the same coin always reads the same. */
export function videoDescription(row, url) {
  const key = String(row.inventoryID);
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `${WORDINGS[h % WORDINGS.length](coinName(row), url)}\n\n#coins #numismatics #coincollecting`;
}

const MINTS = { CC: 'Carson City', S: 'San Francisco Mint', O: 'New Orleans Mint', D: 'Denver Mint', W: 'West Point Mint' };
const GRADERS = /^(PCGS|NGC|CACG|CAC|ANACS|ICG)$/;

/** 5–6 tags: the coin with its date, the series, grading company, CAC / mint, then two general ones. */
export function videoTags(row) {
  const name = coinName(row);
  const words = name.split(' ');
  const tags = [];
  if (isIngot(row)) {
    if (/san francisco/i.test(name)) tags.push('San Francisco Mint ingot');
    if (row.Type2) tags.push(clean(row.Type2));
    tags.push('silver ingot', 'bullion');
  } else {
    const g = words.findIndex((w, i) => i > 0 && GRADERS.test(w));
    // "#85 of 230" and "1804(2026)" are about this one coin, not what people search for.
    const series = clean(words.slice(1, g > 0 ? g : undefined).join(' ')
      .replace(/#\d+ of \d+/g, '').replace(/\S*\(\d+\)/g, ''));
    if (series) tags.push(`${words[0]} ${series}`, series);
    if (g > 0) tags.push(words[g]);
    const mm = /^\d{4}(?:\/\d+)?-([A-Z]{1,2})$/.exec(words[0])?.[1];
    if (MINTS[mm]) tags.push(MINTS[mm]);
    if (words.includes('CAC') && words[g] !== 'CAC') tags.push('CAC');
  }
  const out = [...new Set(tags.map(clean).filter(Boolean))].slice(0, 4);
  return [...out, 'coin collecting', 'Cabbage Coins'];
}

// ---------------------------------------------------------------------------
// YouTube
// ---------------------------------------------------------------------------

const YT = 'https://www.googleapis.com/youtube/v3';
let token = null;

async function accessToken() {
  if (token && token.until > Date.now()) return token.value;
  const { YOUTUBE_CLIENT_ID: id, YOUTUBE_CLIENT_SECRET: secret, YOUTUBE_REFRESH_TOKEN: refresh } = process.env;
  if (!refresh) throw new Error('Not connected to YouTube yet: run Extras\\Connect-YouTube first.');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: new URLSearchParams({ client_id: id, client_secret: secret, refresh_token: refresh, grant_type: 'refresh_token' }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(`YouTube sign-in failed (${j.error}): run Extras\\Connect-YouTube again.`);
  token = { value: j.access_token, until: Date.now() + (j.expires_in - 120) * 1000 };
  return token.value;
}

async function yt(method, pathAndQuery, body) {
  const res = await fetch(`${YT}/${pathAndQuery}`, {
    method,
    headers: { Authorization: `Bearer ${await accessToken()}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`YouTube said ${res.status}: ${j.error?.message ?? JSON.stringify(j)}`);
  return j;
}

/** The channel's most recent uploads (newest first): [{ id, title }]. */
async function recentUploads(max = 200) {
  const ch = await yt('GET', 'channels?part=contentDetails&mine=true');
  const list = ch.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!list) throw new Error('This YouTube login has no channel. Run Extras\\Connect-YouTube and pick the Cabbage Coins channel.');
  const out = [];
  let page = '';
  while (out.length < max) {
    const j = await yt('GET', `playlistItems?part=snippet&maxResults=50&playlistId=${list}${page ? `&pageToken=${page}` : ''}`);
    for (const it of j.items ?? []) out.push({ id: it.snippet.resourceId.videoId, title: clean(it.snippet.title) });
    if (!j.nextPageToken) break;
    page = j.nextPageToken;
  }
  return out;
}

/**
 * Puts videos in the channel's "Inventory Highlights" playlist (settings.json → shorts.playlist), skipping any already
 * in it. Returns { added, already }. Tony 2026-11-20: every listing Short belongs there.
 */
export async function addToPlaylist(videoIds, name = settings.shorts.playlist) {
  let list = null, page = '';
  do {
    const j = await yt('GET', `playlists?part=snippet&mine=true&maxResults=50${page ? `&pageToken=${page}` : ''}`);
    list = (j.items ?? []).find((p) => clean(p.snippet.title).toLowerCase() === clean(name).toLowerCase()) ?? null;
    page = list ? '' : j.nextPageToken ?? '';
  } while (page);
  if (!list) throw new Error(`No playlist named "${name}" on the channel (settings.json → shorts.playlist).`);
  const inIt = new Set();
  page = '';
  do {
    const j = await yt('GET', `playlistItems?part=contentDetails&maxResults=50&playlistId=${list.id}${page ? `&pageToken=${page}` : ''}`);
    for (const it of j.items ?? []) inIt.add(it.contentDetails.videoId);
    page = j.nextPageToken ?? '';
  } while (page);
  const added = [], already = [];
  for (const id of videoIds) {
    if (inIt.has(id)) { already.push(id); continue; }
    await yt('POST', 'playlistItems?part=snippet', { snippet: { playlistId: list.id, resourceId: { kind: 'youtube#video', videoId: id } } });
    added.push(id);
  }
  return { added, already };
}

async function videoDetails(ids) {
  const out = new Map();
  for (let i = 0; i < ids.length; i += 50) {
    const j = await yt('GET', `videos?part=snippet,status,processingDetails&id=${ids.slice(i, i + 50).join(',')}`);
    for (const v of j.items ?? []) out.set(v.id, v);
  }
  return out;
}

/** Title, description, tags, Unlisted, not for kids. Everything else the video already has is kept (YouTube clears what's left out). */
async function updateVideo(v, { title, description, tags }) {
  const s = v.snippet, st = v.status;
  await yt('PUT', 'videos?part=snippet,status', {
    id: v.id,
    snippet: {
      title, description, tags,
      categoryId: s.categoryId,
      ...(s.defaultLanguage ? { defaultLanguage: s.defaultLanguage } : {}),
      ...(s.defaultAudioLanguage ? { defaultAudioLanguage: s.defaultAudioLanguage } : {}),
    },
    status: {
      privacyStatus: 'unlisted',
      selfDeclaredMadeForKids: false,
      embeddable: true,                      // the website plays it in a frame
      license: st.license ?? 'youtube',
      publicStatsViewable: st.publicStatsViewable ?? true,
      ...(st.containsSyntheticMedia != null ? { containsSyntheticMedia: st.containsSyntheticMedia } : {}),
    },
  });
}

/** The video's very first frame as a 1080-wide JPEG (YouTube's thumbnail limit is 2 MB; this lands around 0.3–0.6 MB). */
async function firstFrame(videoFile) {
  const out = path.join(os.tmpdir(), `short-thumb-${process.pid}-${Date.now()}.jpg`);
  for (const q of [3, 6, 10]) {   // lower the quality only if a busy frame comes out over 2 MB
    await promisify(execFile)(ffmpegPath, ['-v', 'error', '-y', '-i', videoFile, '-frames:v', '1', '-vf', 'scale=1080:-2', '-q:v', String(q), out]);
    if (fs.statSync(out).size < 2 * 1024 * 1024) return out;
  }
  return out;
}

/** Sets the opening frame of the local file as the video's thumbnail (Tony 2026-11-20: YouTube's 3 suggestions are rarely good). */
async function setThumbnail(videoId, videoFile) {
  const jpg = await firstFrame(videoFile);
  try {
    const res = await fetch(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${videoId}&uploadType=media`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'image/jpeg' },
      body: fs.readFileSync(jpg),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`YouTube said ${res.status}: ${j.error?.message ?? JSON.stringify(j)}`);
  } finally {
    fs.rmSync(jpg, { force: true });
  }
}

const processed = (v) => v?.processingDetails?.processingStatus === 'succeeded' && v?.status?.uploadStatus === 'processed';
const broken = (v) => ['failed', 'terminated'].includes(v?.processingDetails?.processingStatus)
  || ['failed', 'rejected', 'deleted'].includes(v?.status?.uploadStatus);

// ---------------------------------------------------------------------------
// Planning
// ---------------------------------------------------------------------------

/**
 * Pairs each Video-R workbook row with its file, listing and YouTube video. Pure, so the tests can call it.
 * files: ['45673714.MP4', …]; listings: [{ _id, name, gradenumber, slug, youtubeUrl }]; uploads: [{ id, title }].
 */
const loose = (s) => String(s).toLowerCase().replace(/[\s_-]+/g, ' ').trim();

export function planShorts(rows, files, listings, uploads, { replace = false } = {}) {
  const ready = rows.filter((r) => /^r$/i.test(clean(r.Video)) && r.inventoryID != null);
  const fileOf = new Map(files.filter((f) => VIDEO_EXT.test(f)).map((f) => [f.replace(VIDEO_EXT, '').toLowerCase(), f]));
  const items = [];
  const usedFiles = new Set();
  for (const row of ready) {
    const key = certKey(row.inventoryID);          // "45673714_2" → "45673714"; "SF_213" stays
    const file = fileOf.get(key) ?? null;
    if (file) usedFiles.add(key);
    const listing = listings.find((l) => hasCert(l.gradenumber) && certKey(l.gradenumber) === key)
      ?? listings.find((l) => !hasCert(l.gradenumber) && nameKey(l.name) === nameKey(row.itemDescription)) ?? null;
    const title = videoTitle(row);
    // YouTube Studio turns "-" and "_" in a file name into spaces: "SF_213.MP4" arrives titled "SF 213".
    const video = uploads.find((u) => loose(u.title) === loose(key) || u.title === title)
      ?? (file ? uploads.find((u) => loose(u.title) === loose(file.replace(VIDEO_EXT, ''))) : null) ?? null;
    const item = { row, key, file, listing, video, title };
    if (!listing) item.skip = 'no listing on the website';
    else if (listing.youtubeUrl && !replace && !(video && listing.youtubeUrl.includes(video.id))) item.skip = `listing already has a video (${listing.youtubeUrl})`;
    else if (listing.youtubeUrl && video && listing.youtubeUrl.includes(video.id)) item.skip = 'already done (this video is on its listing)';
    else if (!video) item.skip = file ? 'not on YouTube yet: drag the file into YouTube Studio' : 'no video file and not on YouTube';
    if (!item.skip) {
      item.url = listingUrl(listing.slug);
      item.description = videoDescription(row, item.url);
      item.tags = videoTags(row);
    }
    items.push(item);
  }
  const strayFiles = [...fileOf].filter(([k]) => !usedFiles.has(k)).map(([, f]) => f);
  return { items, todo: items.filter((i) => !i.skip), strayFiles };
}

// ---------------------------------------------------------------------------
// The live timer
// ---------------------------------------------------------------------------

const mmss = (ms) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
const SPIN = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏';

function statusLine(item, v) {
  if (processed(v)) return '✔ ready';
  if (broken(v)) return `✗ YouTube ${v.processingDetails?.processingStatus ?? v.status?.uploadStatus} — check it in YouTube Studio`;
  const p = v?.processingDetails?.processingProgress;
  if (p?.partsTotal) {
    const pct = Math.min(100, Math.round((100 * p.partsProcessed) / p.partsTotal));
    const bar = '█'.repeat(Math.round(pct / 5)).padEnd(20, '░');
    return `${bar} ${String(pct).padStart(3)}%${p.timeLeftMs ? `  ~${mmss(Number(p.timeLeftMs))} left` : ''}`;
  }
  return v?.status?.uploadStatus === 'uploaded' ? 'processing…' : 'waiting for YouTube…';
}

/** Polls YouTube until every video is processed (or broken, or the time limit). Redraws one block on screen. */
async function waitForProcessing(todo) {
  const start = Date.now();
  const tty = process.stdout.isTTY;
  let drawn = 0, tick = 0, details = new Map(), lastPoll = 0;
  const label = (i) => i.title.length > 58 ? `${i.title.slice(0, 57)}…` : i.title.padEnd(58);
  for (;;) {
    if (Date.now() - lastPoll >= POLL_SEC * 1000) {
      try { details = await videoDetails(todo.map((i) => i.video.id)); } catch (e) { /* a network blip: try again next poll */ }
      lastPoll = Date.now();
    }
    const done = todo.filter((i) => processed(details.get(i.video.id)) || broken(details.get(i.video.id))).length;
    const lines = [
      `${SPIN[tick++ % SPIN.length]} Waiting for YouTube to finish processing — ${done} of ${todo.length} done — ${mmss(Date.now() - start)} elapsed`,
      ...todo.map((i) => `   ${label(i)}  ${statusLine(i, details.get(i.video.id))}`),
    ];
    if (tty) {
      if (drawn) { readline.moveCursor(process.stdout, 0, -drawn); readline.clearScreenDown(process.stdout); }
      process.stdout.write(lines.join('\n') + '\n');
      drawn = lines.length;
    } else if (tick % 4 === 1) console.log(lines[0]);
    if (done === todo.length) break;
    if (Date.now() - start > WAIT_LIMIT_MIN * 60000) {
      console.log(`\n  Still processing after ${WAIT_LIMIT_MIN} minutes. Those will be linked next time you run this.`);
      break;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return details;
}

// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const ASK = args.includes('--ask');
  let APPLY = args.includes('--apply');
  const REPLACE = args.includes('--replace');

  const { rows, savedAt } = readInventory(undefined, ['inventoryID', 'Type', 'Type2', 'itemDescription', 'Certification', 'Video']);
  console.log(`Workbook last saved ${savedAt.toLocaleString()}. (A change you just typed in counts only once Excel has SAVED it.)\n`);
  const files = fs.existsSync(settings.shorts.ready) ? fs.readdirSync(settings.shorts.ready) : [];
  const client = sanity();
  const listings = await client.fetch(`*[_type == "listing" && !(_id in path("drafts.**"))]{_id, name, gradenumber, "slug": slug.current, youtubeUrl}`);
  const uploads = await recentUploads();
  const plan = planShorts(rows, files, listings, uploads, { replace: REPLACE });

  if (!plan.items.length) {
    console.log('No coin says "R" in the workbook\'s Video column. Nothing to do.');
    return;
  }
  console.log(`  ${plan.items.length} coin(s) marked R in the Video column:\n`);
  for (const i of plan.items) {
    console.log(`  ${i.skip ? '·' : '▶'} ${i.title}`);
    if (i.skip) { console.log(`      skipped: ${i.skip}`); continue; }
    console.log(`      video https://youtube.com/shorts/${i.video.id}  →  ${i.url}`);
    console.log(`      tags: ${i.tags.join(', ')}`);
  }
  if (plan.strayFiles.length) console.log(`\n  Video files with no "R" coin (left alone): ${plan.strayFiles.join(', ')}`);
  if (!plan.todo.length) { console.log('\nNothing to do right now.'); return; }
  console.log(`\n  Example description (${plan.todo[0].key}):\n${plan.todo[0].description.replace(/^/gm, '      | ')}`);

  if (!APPLY && ASK) APPLY = await askYes(`\nUpdate these ${plan.todo.length} video(s), link them to their listings and rebuild the site? (y/N) `);
  if (!APPLY) { console.log('\nPreview only. Nothing was changed.'); return; }

  // 1. Titles, descriptions, tags, Unlisted, not for kids.
  console.log('\n  Updating the videos on YouTube…');
  let details = await videoDetails(plan.todo.map((i) => i.video.id));
  const updated = [];
  for (const i of plan.todo) {
    const v = details.get(i.video.id);
    if (!v) { console.log(`    ✗ ${i.title}: YouTube can't find the video any more`); continue; }
    // One retry after 30 s: on the first run (2026-11-20) 2 of 13 freshly uploaded videos weren't updated, and a re-run did them fine.
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await updateVideo(v, i);
        updated.push(i);
        console.log(`    ✔ ${i.title}`);
        break;
      } catch (e) {
        if (attempt === 1) { console.log(`    … ${i.title}: ${e.message}. Trying again in 30 seconds.`); await new Promise((r) => setTimeout(r, 30000)); }
        else console.log(`    ✗ ${i.title}: ${e.message}. Run this again later; it picks up where it left off.`);
      }
    }
  }
  if (!updated.length) return;

  // 1b. Into the "Inventory Highlights" playlist (a failure here is reported but doesn't stop the rest).
  try {
    const { added, already } = await addToPlaylist(updated.map((i) => i.video.id));
    console.log(`  ✔ "${settings.shorts.playlist}" playlist: ${added.length} added${already.length ? `, ${already.length} already in it` : ''}.`);
  } catch (e) {
    console.log(`  ✗ Couldn't add them to the "${settings.shorts.playlist}" playlist: ${e.message}. Add them in YouTube Studio.`);
  }

  // 2. Wait for processing.
  console.log('');
  details = await waitForProcessing(updated);
  const ready = updated.filter((i) => processed(details.get(i.video.id)));
  // YouTube can take a few seconds to show a changed visibility: look again before warning.
  let visibility = ready.filter((i) => details.get(i.video.id)?.status?.privacyStatus !== 'unlisted');
  if (visibility.length) {
    await new Promise((r) => setTimeout(r, 15000));
    const again = await videoDetails(visibility.map((i) => i.video.id));
    for (const [id, v] of again) details.set(id, v);
    visibility = visibility.filter((i) => details.get(i.video.id)?.status?.privacyStatus !== 'unlisted');
  }
  for (const i of visibility) console.log(`  ⚠ ${i.title} is ${details.get(i.video.id)?.status?.privacyStatus}, not unlisted: check it in YouTube Studio.`);

  if (!ready.length) { console.log('\nNo video finished processing, so no listing was changed. Run this again later.'); return; }

  // 3. Thumbnails: the opening frame of each file (only once processing is done, or YouTube may ignore it).
  console.log('\n  Setting thumbnails (the opening frame of each video)…');
  for (const i of ready) {
    if (!i.file) { console.log(`    · ${i.title}: no video file here, YouTube's own thumbnail kept`); continue; }
    try {
      await setThumbnail(i.video.id, path.join(settings.shorts.ready, i.file));
      console.log(`    ✔ ${i.title}`);
    } catch (e) {
      console.log(`    ✗ ${i.title}: ${e.message} (YouTube's own thumbnail kept)`);
    }
  }

  // 4. Link the listings (published + any open draft), 5. one build, 6. move the files.
  console.log(`\n  Linking ${ready.length} listing(s)…`);
  const drafts = new Set(await client.fetch(`*[_type == "listing" && _id in path("drafts.**")]._id`));
  const linked = [];
  for (const i of ready) {
    const url = `https://youtube.com/shorts/${i.video.id}`;
    const tx = client.transaction().patch(i.listing._id, (p) => p.set({ youtubeUrl: url }));
    if (drafts.has(`drafts.${i.listing._id}`)) tx.patch(`drafts.${i.listing._id}`, (p) => p.set({ youtubeUrl: url }));
    try {
      await tx.commit();
      linked.push(i);
      console.log(`    ✔ ${i.title}`);
    } catch (e) {
      console.log(`    ✗ ${i.title}: ${e.message}`);
    }
  }
  if (linked.length) await startBuild();

  fs.mkdirSync(settings.shorts.uploaded, { recursive: true });
  for (const i of linked.filter((x) => x.file)) {
    try {
      fs.renameSync(path.join(settings.shorts.ready, i.file), path.join(settings.shorts.uploaded, i.file));
    } catch (e) {
      console.log(`  ! Couldn't move ${i.file} to Uploaded (${e.code}). Move it by hand.`);
    }
  }

  console.log(`\n  Done: ${linked.length} of ${plan.todo.length} linked.`);
  if (linked.length) {
    console.log('  In the workbook, change Video from R to Y for:');
    for (const i of linked) console.log(`    ${i.row.inventoryID}`);
  }
  const left = plan.todo.length - linked.length;
  if (left) console.log(`  ${left} not finished: run this again later; it picks up where it left off.`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(`\n✗ ${err.message}`);
    process.exitCode = 1;
  });
}
