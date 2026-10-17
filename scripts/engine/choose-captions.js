/**
 * Caption suggestions for new draft listings, plus a chooser page.
 *
 * Run after you've added photos to the drafts in the Studio. For every DRAFT listing
 * that has photos but no caption, Claude looks at the photos (including the slab
 * label and CAC sticker) and suggests captions. A page then opens in your browser:
 * pick one of the three, or write your own, and flag any you'd never publish. Save
 * writes your picks into the drafts' Caption field. Nothing is published.
 *
 * Suggestions are saved in .caption-suggestions.json, so re-running (say, to finish
 * the coins you skipped) doesn't pay for them again. What you pick, write, and flag
 * goes into caption-feedback.json, which steers the next batch.
 *
 * Usage:
 *   node choose-captions.js            suggest (new coins only) + open the chooser
 *   node choose-captions.js --fresh    throw away saved suggestions and ask again
 *
 * Env: SANITY_WRITE_TOKEN, ANTHROPIC_API_KEY (scripts/engine/.env).
 */

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { createClient } from '@sanity/client';
import Anthropic from '@anthropic-ai/sdk';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const FRESH = process.argv.includes('--fresh');
const PORT = 4646;
const MODEL = 'claude-opus-5-5';
const SUGGESTIONS_FILE = path.join(__dirname, '.caption-suggestions.json');
const FEEDBACK_FILE = path.join(__dirname, 'caption-feedback.json');
const PAGE_FILE = path.join(__dirname, 'choose-captions.html');
const HISTORY_FILE = path.join(__dirname, 'caption-history.jsonl');
const tryAt = process.argv.indexOf('--try');
const TRY = tryAt !== -1 ? process.argv[tryAt + 1] : null;
const SHOW = 3;      // options shown per coin
const ASK_FOR = 8;   // asked for, so the filters below still leave three

for (const key of ['SANITY_WRITE_TOKEN', 'ANTHROPIC_API_KEY']) {
  if (!process.env[key]) {
    console.error(`\n✗ ${key} is missing from scripts/engine/.env — see scripts/README.md.\n`);
    process.exit(1);
  }
}

const sanity = createClient({
  projectId: process.env.SANITY_PROJECT_ID || 'la880an7',
  dataset: process.env.SANITY_DATASET || 'production',
  apiVersion: '2023-01-01',
  token: process.env.SANITY_WRITE_TOKEN,
  useCdn: false,
  perspective: 'raw',
});
const claude = new Anthropic();

const readJson = (file, fallback) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } };
const writeJson = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');

// ---------------------------------------------------------------------------
// Rules enforced in code (the prompt asks too, but these never slip through)
// ---------------------------------------------------------------------------
// Words that read as AI-written. (Not "gorgeous", "stunning", "exquisite": Tony uses those himself.)
const AI_WORDS = /\b(breathtaking|captivating|mesmeri[sz]ing|timeless|treasure|boasts?|showcases?|testament|a true gem)\b/i;
// Tony is color-blind and won't sell on a shade he can't confirm. Color is still a selling point —
// his own captions say "Absolutely Gorgeous Color" — but never name the hue.
const NARROW_COLORS = /\b(lavender|rose|rosy|champagne|apricot|honey|mahogany|peach|blue|amber|purple|violet|magenta|teal|orange|pink|crimson|cobalt|turquoise|russet|cherry|plum|lilac|aqua|cyan|emerald|olive|tan|cream|creamy|pewter|steel|charcoal|chocolate|caramel|copper-?colored|bronze-?colored)\b/i;
const FILLER = new Set(['a', 'an', 'the', 'this', 'that', 'one', 'our', 'my', 'just', 'very', 'so']);
const LINKING = new Set([...FILLER, 'in', 'with', 'and', 'of', 'on', 'for', 'at', 'from']);
const MAX_WORDS = 6;

const words = (s) => s.toLowerCase().replace(/[^a-z0-9$'+-]+/g, ' ').trim().split(/\s+/).filter((w) => /[a-z0-9]/.test(w));
const leadWord = (s) => words(s).find((w) => !FILLER.has(w)) || '';
const leadPair = (s) => { const w = words(s).filter((x) => !FILLER.has(x)); return w.length > 1 && !/^\d/.test(w[0]) ? `${w[0]} ${w[1]}` : ''; };
const trigrams = (s) => { const w = words(s); return w.slice(0, -2).map((_, i) => w.slice(i, i + 3).join(' ')); };

/** True when the caption is mostly the listing title again ("1831 25C Capped Bust Quarter MS64+"). */
function restatesTitle(text, coin) {
  const title = new Set(words(`${coin.name} ${coin.grade || ''} ${coin.gradingCompany || ''}`));
  const w = words(text).filter((x) => !LINKING.has(x));
  return w.length > 0 && w.filter((x) => title.has(x)).length / w.length >= 0.75;
}

/** Why a candidate is rejected (or null). `taken` = captions on the site or waiting in drafts. */
function rejectReason(text, coin, taken, never) {
  const n = text ? words(text).length : 0;
  if (n < 2) return 'too short';
  if (n > MAX_WORDS) return `too long (${n} words)`;
  if (/[—–]/.test(text)) return 'em dash';
  if (AI_WORDS.test(text)) return 'AI word';
  if (NARROW_COLORS.test(text)) return 'names a specific color';
  if (restatesTitle(text, coin)) return 'repeats the listing title';
  const lp = leadPair(text);
  if (lp && taken.pairs.has(lp)) return `starts like "${taken.pairOf.get(lp)}"`;
  for (const t of trigrams(text)) if (taken.trigrams.has(t)) return `repeats "${t}"`;
  const low = text.toLowerCase();
  if (never.some((x) => x.text.toLowerCase() === low)) return 'flagged before';
  return null;
}

function takenIndex(captions) {
  const pairs = new Set(), pairOf = new Map(), tri = new Set();
  for (const c of captions) {
    const lp = leadPair(c);
    if (lp) { pairs.add(lp); if (!pairOf.has(lp)) pairOf.set(lp, c); }
    for (const t of trigrams(c)) tri.add(t);
  }
  return { pairs, pairOf, trigrams: tri };
}

// ---------------------------------------------------------------------------
// Sanity
// ---------------------------------------------------------------------------
async function loadState() {
  const needCaption = await sanity.fetch(`*[_type == "listing" && _id in path("drafts.**")
      && defined(image.asset) && (!defined(image.caption) || image.caption == "")] | order(name asc) {
    _id, name, grade, gradingCompany, cac, date, dateshown,
    pcgsPop { thisPop, thisHigher, grade },
    "main": image.asset->url,
    "gallery": imagesGallery[defined(asset)].asset->url
  }`);
  for (const c of needCaption) c.photos = [c.main, ...(c.gallery || [])].filter(Boolean);
  // Everything that is (or is about to be) on the site at the same time.
  const inUse = await sanity.fetch(`*[_type == "listing" && sold != true
      && defined(image.caption) && image.caption != ""].image.caption`);
  return { needCaption, inUse: [...new Set(inUse)] };
}

const imgUrl = (u, w) => `${u}?w=${w}&q=90&fm=jpg`;

// ---------------------------------------------------------------------------
// Claude
// ---------------------------------------------------------------------------
function systemPrompt(inUse, feedback) {
  const list = (a) => a.map((x) => `- ${typeof x === 'string' ? x : x.text}${x.why ? `  (${x.why})` : ''}`).join('\n');
  return `You write the caption for a Cabbage Coins listing: a 3-to-6-word headline shown over the coin's photos. Its one job is to make a collector stop scrolling and want this coin. The dealer picks one of your suggestions or writes his own, so it has to sound like him, not like AI.

## Captions he wrote himself (most recent first; this is the target)
${list([...feedback.written].reverse().slice(0, 40))}

## His other captions on the site
${list(inUse)}

## Your suggestions he picked
${list(feedback.liked.slice(-40))}

## Your suggestions he flagged "I'd never publish this"
${list(feedback.never.slice(-60))}

## How to write them
- 3 to 6 words. Short and punchy beats clever. An exclamation point is welcome. A plain hyphen (" - ") is fine; never an em dash.
- Lead with the coin's best selling point, the thing that makes it exciting to own:
  - Eye appeal first. When the coin has striking toning or color, that IS the headline. Say it with feeling, the way he does: "Absolutely Gorgeous Color", "Incredible, Ethereal Color", "Slight Rainbow Toning - Amazing!". Never name a specific shade (blue, rose, lavender, amber and so on). He is color-blind and can't confirm shades, so talk about how strong and beautiful the color is, not which colors it is.
  - The look of the surfaces: crusty and original, blast white, frosty luster, deep mirrors, cameo contrast, a bold strike.
  - A real hook: a key or better date, a famous pedigree on the label, CAC, a low PCGS population (only from the numbers given).
- Never just restate the listing title. "1831 25C Capped Bust Quarter MS64+" is the title, not a caption. A date or grade is fine only as part of a hook.
- Don't try too hard. No explanations, arguments or comparisons ("AU58 Over a Baggy MS61 Any Day IMO", "XF40 Is the Sweet Spot IMO"), no trivia sentences, no puns.
- Never state what the grade already implies (great condition at MS65, lots of detail at XF). Nothing a beginner would say.
- Numbers: population only from the PCGS data given. No mintages, prices, "finest known" or "top pop".
- No die-variety numbers (O-101a, B-4, VAM-3 and so on) unless the slab label shows them.
- Only call a date key, semi-key or scarce if that's well established. Put any factual claim that doesn't come from the slab label or the PCGS data in "check" (e.g. "1893-S is the key date of the Morgan series"). Leave "check" empty when there's nothing to verify.
- Avoid: breathtaking, captivating, mesmerizing, timeless, treasure, boasts, showcases, testament.
- Don't copy a caption above or reuse its distinctive phrases. The site shouldn't show two captions that sound alike.

Look at every photo and read the slab label. Judge how much the color or toning stands out: "strong" means it would be the first thing a collector notices. Give ${ASK_FOR} candidates and tag each with its angle. If the color is strong, at least 3 of them must be about the color.`;
}

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['label', 'mismatch', 'seen', 'color', 'candidates'],
  properties: {
    label: { type: 'string', description: 'The slab label text as read from the photos.' },
    mismatch: { type: 'string', description: 'Anything on the label that contradicts the listing details given (grade, company, date, sticker). Empty if none.' },
    seen: { type: 'string', description: 'One short line: what in the photos the captions draw on.' },
    color: { type: 'string', enum: ['none', 'some', 'strong'], description: 'How much the toning or color stands out.' },
    candidates: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['text', 'angle', 'check'],
        properties: {
          text: { type: 'string' },
          angle: { type: 'string', enum: ['color', 'look', 'hook'] },
          check: { type: 'string', description: 'A factual claim the dealer should verify, or empty.' },
        },
      },
    },
  },
};

async function suggest(coin, system) {
  const pop = coin.pcgsPop?.thisPop != null
    ? `PCGS population: ${coin.pcgsPop.thisPop} at ${coin.pcgsPop.grade || coin.grade}, ${coin.pcgsPop.thisHigher} graded higher.`
    : 'No population data for this coin.';
  const details = [
    `Listing name: ${coin.name.trim()}`,
    `Grade: ${coin.grade || '?'} · Grading company: ${coin.gradingCompany || '?'} · CAC: ${coin.cac ? 'yes' : 'no'}`,
    pop,
  ].join('\n');
  const photos = coin.photos.filter(Boolean).slice(0, 4);
  const res = await claude.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'high', format: { type: 'json_schema', schema: SCHEMA } },
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    messages: [{
      role: 'user',
      content: [
        ...photos.map((u) => ({ type: 'image', source: { type: 'url', url: imgUrl(u, 1200) } })),
        { type: 'text', text: details },
      ],
    }],
  });
  if (res.stop_reason === 'refusal') throw new Error('Claude declined this one');
  if (res.stop_reason === 'max_tokens') throw new Error('answer was cut off');
  const text = res.content.find((b) => b.type === 'text')?.text;
  if (!text) throw new Error('empty answer');
  return JSON.parse(text);
}

async function runSuggestions(coins, inUse, feedback) {
  const saved = FRESH ? {} : readJson(SUGGESTIONS_FILE, {});
  const todo = coins.filter((c) => !saved[c._id]);
  if (!todo.length) return saved;
  console.log(`\nAsking Claude about ${todo.length} coin${todo.length === 1 ? '' : 's'} (about 10¢ each)…`);
  const system = systemPrompt(inUse, feedback);
  let done = 0, badKey = false;
  const queue = [...todo];
  async function worker() {
    for (let coin; (coin = queue.shift());) {
      try {
        saved[coin._id] = await suggest(coin, system);
        writeJson(SUGGESTIONS_FILE, saved);
        console.log(`  ✓ ${++done}/${todo.length}  ${coin.name.trim()}`);
      } catch (e) {
        if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
          queue.length = 0;
          badKey = true;
          return;
        }
        console.log(`  ✗ ${coin.name.trim()}: ${e.message}`);
      }
    }
  }
  await worker();                                  // first call alone, so the rest reuse its cached prompt
  queue.length && await Promise.all([worker(), worker(), worker()]);
  if (badKey) throw new Error('Anthropic refused the API key in scripts/engine/.env (ANTHROPIC_API_KEY). Check it, or make a new one.');
  return saved;
}

/**
 * Apply the code-side rules, then choose three that differ in angle. When the color is strong,
 * a color caption always makes the cut (Tony: on a toned coin, the color IS the selling point).
 * Repeats between coins in this batch are caught on the page, against what Tony actually picks.
 */
function pickOptions(s, coin, taken, never) {
  const ok = [], dropped = [];
  const label = (s.label || '').toUpperCase().replace(/\s+/g, '');
  for (const c of s.candidates || []) {
    const text = c.text?.trim() || '';
    // Die varieties (O-101a, B-4, VAM-3, FS-101…) only when the slab label shows them.
    const variety = text.match(/\b(?:O|B|LM|JR|VAM|FS|DDO|DDR|BR|BB)-?\d+[A-Z]?\b/i);
    const why = (variety && !label.includes(variety[0].toUpperCase().replace(/\s+/g, '')) ? `variety "${variety[0]}" isn't on the label` : null)
      || rejectReason(text, coin, taken, never)
      || (ok.some((k) => leadWord(k.text) === leadWord(text)) ? 'starts like another option' : null);
    if (why) dropped.push({ text, why });
    else ok.push({ text, angle: c.angle, check: c.check?.trim() || '' });
  }
  // The model tends to under-rate color ("some" on coins Tony calls killer color), so any notable
  // color leads; "strong" also earns a second color option.
  const order = s.color === 'strong' ? ['color', 'look', 'hook', 'color']
    : s.color === 'some' ? ['color', 'look', 'hook'] : ['look', 'hook', 'color'];
  const kept = [];
  for (const angle of order) {
    const next = ok.find((c) => c.angle === angle && !kept.includes(c));
    if (next && kept.length < SHOW) kept.push(next);
  }
  for (const c of ok) if (kept.length < SHOW && !kept.includes(c)) kept.push(c);
  return { kept, dropped };
}

function buildBatch(coins, suggestions, inUse, feedback) {
  const taken = takenIndex(inUse);
  const out = [];
  for (const coin of coins) {
    const s = suggestions[coin._id];
    if (!s) continue;
    const { kept, dropped } = pickOptions(s, coin, taken, feedback.never);
    out.push({
      id: coin._id, name: coin.name.trim(), grade: coin.grade,
      photos: coin.photos.filter(Boolean).slice(0, 4).map((u) => ({ thumb: imgUrl(u, 600), full: imgUrl(u, 1400) })),
      label: s.label, mismatch: s.mismatch, seen: s.seen, color: s.color, options: kept, dropped,
      lead: kept.map((k) => leadWord(k.text)),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Saving
// ---------------------------------------------------------------------------
async function save(choices, batch, feedback) {
  const byId = new Map(batch.map((c) => [c.id, c]));
  const results = [];
  const tx = sanity.transaction();
  const ids = choices.filter((c) => c.caption?.trim() && byId.has(c.id) && c.id.startsWith('drafts.')).map((c) => c.id);
  const current = ids.length
    ? await sanity.fetch(`*[_id in $ids]{_id, "cap": image.caption}`, { ids })
    : [];
  const hasCaption = new Map(current.map((d) => [d._id, d.cap]));
  let writes = 0;
  for (const ch of choices) {
    const coin = byId.get(ch.id);
    if (!coin) continue;
    for (const f of ch.flagged || []) {
      if (!feedback.never.some((n) => n.text === f)) feedback.never.push({ text: f, coin: coin.name });
    }
    const caption = ch.caption?.trim();
    if (!caption) continue;
    if (!ch.id.startsWith('drafts.')) { results.push({ name: coin.name, status: 'skipped: not a draft' }); continue; }
    if (hasCaption.get(ch.id)) { results.push({ name: coin.name, status: `skipped: already has "${hasCaption.get(ch.id)}"` }); continue; }
    tx.patch(ch.id, (p) => p.set({ 'image.caption': caption }));
    writes++;
    const list = ch.source === 'own' ? feedback.written : feedback.liked;
    list.push({ text: caption, coin: coin.name });
    results.push({ id: ch.id, name: coin.name, status: 'saved', caption });
  }
  if (writes) await tx.commit();
  writeJson(FEEDBACK_FILE, feedback);
  // A full record of each coin's round, for tuning the rules later.
  const day = new Date().toISOString().slice(0, 10);
  const lines = choices.filter((ch) => byId.has(ch.id) && (ch.caption?.trim() || ch.flagged?.length)).map((ch) => {
    const c = byId.get(ch.id);
    return JSON.stringify({ day, coin: c.name, color: c.color, shown: c.options.map((o) => o.text), dropped: c.dropped,
      chosen: ch.caption?.trim() || null, source: ch.caption?.trim() ? ch.source : null, flagged: ch.flagged || [] });
  });
  if (lines.length) fs.appendFileSync(HISTORY_FILE, lines.join('\n') + '\n');
  // Saved coins no longer need their suggestions.
  const saved = readJson(SUGGESTIONS_FILE, {});
  for (const r of results) if (r.status === 'saved') delete saved[r.id];
  writeJson(SUGGESTIONS_FILE, saved);
  return results;
}

/**
 * --try "<name text>": suggest for matching listings (captioned or not) and print the result next
 * to the caption already on it. Writes nothing and saves nothing; for tuning the rules.
 */
async function tryOut(text) {
  const coins = await sanity.fetch(`*[_type == "listing" && name match $q && defined(image.asset)] | order(name asc) {
    _id, name, grade, gradingCompany, cac, pcgsPop { thisPop, thisHigher, grade },
    "caption": image.caption, "main": image.asset->url, "gallery": imagesGallery[defined(asset)].asset->url
  }`, { q: `*${text}*` });
  if (!coins.length) { console.log(`No listing with photos matches "${text}".`); return; }
  const { inUse } = await loadState();
  for (const coin of coins) {
    coin.photos = [coin.main, ...(coin.gallery || [])].filter(Boolean);
    // As if this coin had no caption yet: hide its own caption and feedback from the prompt.
    const pool = inUse.filter((c) => c !== coin.caption);
    const other = (list) => list.filter((x) => x.coin?.trim() !== coin.name.trim());
    const fb = { never: other(feedback.never), liked: other(feedback.liked), written: other(feedback.written) };
    const s = await suggest(coin, systemPrompt(pool, fb));
    const { kept, dropped } = pickOptions(s, coin, takenIndex(pool), fb.never);
    console.log(`\n${coin.name.trim()}   [color: ${s.color}]   currently: ${coin.caption || '(none)'}`);
    for (const k of kept) console.log(`   ✓ ${k.text}  (${k.angle})${k.check ? `   check: ${k.check}` : ''}`);
    for (const c of s.candidates.filter((c) => !kept.some((k) => k.text === c.text?.trim()))) {
      const d = dropped.find((x) => x.text === c.text?.trim());
      console.log(`   · ${c.text}  (${c.angle})${d ? `   ✗ ${d.why}` : ''}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const feedback = readJson(FEEDBACK_FILE, { never: [], liked: [], written: [] });
// Returns instead of process.exit() while requests may be open (that trips a Node assertion on Windows).
if (TRY) await tryOut(TRY);
else await main();

async function main() {
  const { needCaption, inUse } = await loadState();
  // Wait for all 4 photos, so suggestions aren't made (and paid for) from half a set.
  const withPhotos = needCaption.filter((c) => c.photos.length >= 4);
  const partial = needCaption.filter((c) => c.photos.length < 4);
  if (partial.length) {
    console.log(`\nSkipped until all 4 photos are uploaded:`);
    for (const c of partial) console.log(`  · ${c.name.trim()} (${c.photos.length} of 4)`);
  }
  if (!withPhotos.length) {
    console.log('\nNo draft listings are ready for captions (they need all 4 photos and an empty Caption). Nothing to do.\n');
    return;
  }
  console.log(`\n${withPhotos.length} draft${withPhotos.length === 1 ? '' : 's'} with photos and no caption.`);
  let suggestions;
  try {
    suggestions = await runSuggestions(withPhotos, inUse, feedback);
  } catch (e) {
    console.error(`\n✗ ${e.message}\n`);
    process.exitCode = 1;
    return;
  }
  const batch = buildBatch(withPhotos, suggestions, inUse, feedback);
  if (!batch.length) { console.log('\nNo suggestions came back — see the errors above.\n'); process.exitCode = 1; return; }
  startChooser(batch);
}

function startChooser(batch) {

const server = http.createServer(async (req, res) => {
  const send = (code, type, body) => { res.writeHead(code, { 'Content-Type': type }); res.end(body); };
  try {
    if (req.method === 'GET' && req.url === '/') return send(200, 'text/html; charset=utf-8', fs.readFileSync(PAGE_FILE));
    if (req.method === 'GET' && req.url === '/api/batch') return send(200, 'application/json', JSON.stringify(batch));
    if (req.method === 'POST' && req.url === '/api/save') {
      let body = '';
      for await (const chunk of req) body += chunk;
      const results = await save(JSON.parse(body).choices || [], batch, feedback);
      for (const r of results) console.log(`  ${r.status === 'saved' ? '✓' : '·'} ${r.name}: ${r.status === 'saved' ? r.caption : r.status}`);
      send(200, 'application/json', JSON.stringify({ results }));
      console.log('\nDone. Open the Studio to review and publish.');
      setTimeout(() => process.exit(0), 500);
      return;
    }
    send(404, 'text/plain', 'Not found');
  } catch (e) {
    console.error(e);
    send(500, 'application/json', JSON.stringify({ error: e.message }));
  }
});
server.listen(PORT, '127.0.0.1', () => {
  const url = `http://localhost:${PORT}/`;
  console.log(`\nChooser open at ${url}  (close this window to quit without saving)\n`);
  if (!process.argv.includes('--no-browser')) spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
});
}
