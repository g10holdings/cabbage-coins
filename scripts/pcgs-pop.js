// ---------------------------------------------------------------------------
// PCGS population around a listing's grade, for the listing page
// ---------------------------------------------------------------------------
//
// One listing = one PCGS cert. PCGS's API gives population ONE GRADE PER CALL, so a
// ±2-step grid with plus grades (e.g. MS62 … MS66+, ten cells) would cost ten calls.
// It doesn't have to: "graded higher" chains from grade to grade, so a plus grade's
// population falls out of its neighbours:
//
//     pop(MS64+) = higher(MS64) − pop(MS65) − higher(MS65)
//
// (checked against PCGS's own plus-grade answers, 1916 Mercury dime, 2026-10-10). So the
// grid costs the cert call plus one call per plain grade — about 5 per coin. If a
// computed number ever comes out negative, that plus grade is fetched directly instead.
//
// PCGS's license (PCGS API End User Agreement) allows this "in support of specific
// sales you offer", and requires on each page: a live link to PCGS, the PCGS logo, and
// the credit line in CREDIT_LINE below. The listing page shows all three.
//
// Shares the PCGS account's 100 calls/day with The Cabbage Patch app.
// ---------------------------------------------------------------------------

const API = 'https://api.pcgs.com/publicapi/coindetail';
export const SHELDON = [1, 2, 3, 4, 6, 8, 10, 12, 15, 20, 25, 30, 35, 40, 45, 50, 53, 55, 58, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70];
// PCGS gives plus grades from XF45 to MS68, not at MS60/61.
const PLUS = new Set([45, 50, 53, 55, 58, 62, 63, 64, 65, 66, 67, 68]);
export const CREDIT_LINE = 'The Data is obtained from and is subject to a license agreement with Collectors Universe, Inc. and its divisions PCGS and PSA.';

export class PcgsLimitError extends Error {}

/** "MS64+" / "PR62" / "AU58" → { prefix, num, plus } (null if unreadable). */
export function parseGrade(text) {
  const m = String(text ?? '').match(/^\s*([A-Z]{1,2})\s*-?(\d{1,2})(\+)?/i);
  return m ? { prefix: m[1].toUpperCase(), num: Number(m[2]), plus: Boolean(m[3]) } : null;
}

/** The label PCGS would print: proofs keep PR; business strikes take the prefix for their number. */
function label(prefix, num, plus) {
  const p = prefix === 'PR' || prefix === 'PF' || prefix === 'SP' ? prefix
    : num >= 60 ? 'MS' : num >= 50 ? 'AU' : num >= 40 ? 'XF' : num >= 20 ? 'VF' : num >= 12 ? 'F' : num >= 8 ? 'VG' : num >= 4 ? 'G' : num >= 3 ? 'AG' : num >= 2 ? 'FR' : 'PO';
  return `${p}${num}${plus ? '+' : ''}`;
}

/**
 * @param {{cert: string, token: string, steps?: number, fetchImpl?: typeof fetch, onCall?: () => void,
 *          cache?: {get(key: string): object|undefined, set(key: string, value: object): void}}} o
 *   cache: PCGS answers saved between runs (by request), so a run that stops at the daily limit part-way through a
 *   coin pays for nothing twice. onCall runs before each real call; throw from it to stop (e.g. at a call cap).
 * @returns {Promise<null | {thisPop: number, thisHigher: number, maxPop: number, pcgsNumber: number, name: string, grade: string, coinFactsUrl: string|null, cells: {label: string, num: number, plus: boolean, pop: number, isThisGrade: boolean}[], higherThanTop: number|null, calls: number}>}
 *   null when PCGS has no such cert.
 */
export async function fetchPopGrid({ cert, token, steps = 2, fetchImpl = fetch, onCall = () => {}, cache = null }) {
  let calls = 0;
  async function get(path) {
    const saved = cache?.get(path);
    if (saved !== undefined) return saved;
    onCall();
    calls++;
    const res = await fetchImpl(`${API}${path}`, { headers: { Authorization: `bearer ${token}`, Accept: 'application/json' } });
    if (res.status === 429) throw new PcgsLimitError('PCGS daily limit reached (100 calls/day) — run again later; finished listings are kept.');
    if (res.status === 401 || res.status === 500) throw new Error(`PCGS refused the request (${res.status}) — the PCGS token may have expired.`);
    if (!res.ok) throw new Error(`PCGS request failed (${res.status}).`);
    const b = await res.json();
    // Keep only what the grid needs (CoinFacts answers also carry long notes and auction lists).
    const keep = b?.IsValidRequest && /success/i.test(b.ServerMessage ?? '')
      ? { PCGSNo: b.PCGSNo, Name: b.Name, Grade: b.Grade, Designation: b.Designation, Population: b.Population, PopHigher: b.PopHigher, CoinFactsLink: b.CoinFactsLink }
      : null;
    cache?.set(path, keep);
    return keep;
  }

  const certNo = String(cert).replace(/\D/g, '');
  const coin = await get(`/GetCoinFactsByCertNo/${certNo}`);
  const g = parseGrade(coin?.Grade);
  if (!coin || !g || !SHELDON.includes(g.num)) return null;
  const pcgsNumber = Number(coin.PCGSNo);

  // {pop, higher} per grade key ("64", "64+"); the cert call already answered its own grade.
  const facts = new Map([[`${g.num}${g.plus ? '+' : ''}`, { pop: Number(coin.Population) || 0, higher: Number(coin.PopHigher) || 0 }]]);
  async function at(num, plus) {
    const key = `${num}${plus ? '+' : ''}`;
    if (!facts.has(key)) {
      const b = await get(`/GetCoinFactsByGrade?PCGSNo=${pcgsNumber}&GradeNo=${num}&PlusGrade=${plus}`);
      facts.set(key, { pop: Number(b?.Population) || 0, higher: Number(b?.PopHigher) || 0 });
    }
    return facts.get(key);
  }

  const i = SHELDON.indexOf(g.num);
  const window = SHELDON.slice(Math.max(0, i - steps), i + steps + 1);
  const cells = [];
  for (const num of window) {
    const plain = await at(num, false);
    cells.push({ num, plus: false, pop: plain.pop });
    if (!PLUS.has(num)) continue;
    const next = SHELDON[SHELDON.indexOf(num) + 1];
    let plusPop;
    if (facts.has(`${num}+`)) plusPop = facts.get(`${num}+`).pop;
    else if (next) {
      const n = await at(next, false);
      plusPop = plain.higher - n.pop - n.higher;
      if (plusPop < 0) plusPop = (await at(num, true)).pop;   // the chain didn't add up: ask PCGS directly
      facts.set(`${num}+`, { pop: plusPop, higher: plain.higher - plusPop });
    } else plusPop = (await at(num, true)).pop;
    cells.push({ num, plus: true, pop: plusPop });
  }

  const top = cells.at(-1);
  const topFacts = facts.get(`${top.num}${top.plus ? '+' : ''}`);
  const mine = facts.get(`${g.num}${g.plus ? '+' : ''}`);
  return {
    // The headline: "1 of 9 graded MS64, with 18 graded higher" (PCGS's own counts for this coin's grade).
    thisPop: mine.pop,
    thisHigher: mine.higher,
    maxPop: Math.max(1, ...cells.map((c) => c.pop)),
    pcgsNumber,
    name: coin.Name ?? '',
    // "MS67FB", "PR62CAM": the population is for that designation (PCGS gives each its own PCGS number).
    grade: label(g.prefix, g.num, g.plus) + String(coin.Designation ?? '').replace(/s+/g, '').toUpperCase(),
    coinFactsUrl: coin.CoinFactsLink ? `https://${String(coin.CoinFactsLink).replace(/^https?:\/\//, '')}` : null,
    cells: cells.map((c) => ({ ...c, label: label(g.prefix, c.num, c.plus), isThisGrade: c.num === g.num && c.plus === g.plus })),
    higherThanTop: topFacts ? topFacts.higher : null,
    calls,
  };
}
