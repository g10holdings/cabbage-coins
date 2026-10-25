/**
 * Reads Tony's business workbook (g10HoldingsLLC.xlsx), "inventory" sheet only, and turns each row into
 * the fields a website listing needs.
 *
 * READ-ONLY, BY DESIGN. The workbook is the source of truth for the whole business, so nothing here can
 * change it: the file is copied to a temp file and only the COPY is opened; the copy is deleted after;
 * and the original's size and modified time are checked before and after, so any change would be
 * caught and reported. There is no code in this file (or anywhere in scripts/) that writes to it.
 *
 * Column meanings (Tony, 2026-10-17):
 *   inventoryID     the cert #; a trailing "_2", "_3" marks a coin that came back into stock — stripped.
 *   itemDescription the listing name; the date, denomination and slab grade are read out of it.
 *   Certification   the grading company (PCGS / NGC / CACG; N/A = Ungraded).
 *   PCGS Num        "97199/7199" = designation # (pop data) / catalog # (sorting); a single number = both.
 *   listPrice       the website price.
 *   Website         "R" = ready: photos and listing to be made (the import takes these); "Y" = live on the
 *                   website (Tony sets it once published); "N/A" = never. Status says Active or Sold.
 *
 * Path: "workbook" in settings.json (WORKBOOK_PATH in .env still overrides it).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as XLSX from 'xlsx';
import { settings } from './settings.js';

const SHEET = 'inventory';
const NEEDED = ['inventoryID', 'Type', 'itemDescription', 'Certification', 'CAC', 'PCGS Num', 'Website', 'Status', 'listPrice'];

/** All rows of the inventory sheet, read from a throwaway copy. */
export function readInventory(file = settings.workbook) {
  if (!fs.existsSync(file)) throw new Error(`Workbook not found: ${file}`);
  const before = fs.statSync(file);
  const copy = path.join(os.tmpdir(), `cabbage-workbook-${process.pid}-${Date.now()}.xlsx`);
  fs.copyFileSync(file, copy);   // opens the original for reading only
  let rows;
  try {
    const wb = XLSX.read(fs.readFileSync(copy), { type: 'buffer', sheets: [SHEET], cellDates: true });
    const ws = wb.Sheets[SHEET];
    if (!ws) throw new Error(`The workbook has no sheet named "${SHEET}".`);
    rows = XLSX.utils.sheet_to_json(ws, { defval: null, raw: true });
  } finally {
    fs.rmSync(copy, { force: true });
  }
  const after = fs.statSync(file);
  if (after.size !== before.size || after.mtimeMs !== before.mtimeMs) {
    // Can only mean Excel/OneDrive saved it while we read; we never write. Read again to be safe.
    throw new Error('The workbook changed while it was being read (a save in Excel or a OneDrive sync?). Run again.');
  }
  const missing = NEEDED.filter((h) => !(rows[0] && h in rows[0]));
  if (missing.length) throw new Error(`The inventory sheet is missing column(s): ${missing.join(', ')}. Was a header renamed?`);
  return { rows, file, savedAt: before.mtime };
}

// ---------------------------------------------------------------------------
// Reading listing fields out of a row
// ---------------------------------------------------------------------------

const str = (v) => (v == null ? '' : String(v).trim());

/** "51354567_2" -> "51354567" (only a 1–2 digit "_N"; "SF_535" stays whole). Matching key against a listing's Grade Number. */
export const certKey = (v) => str(v).replace(/_\d{1,2}$/, '').toLowerCase();
/** For items with no cert (ingots, raw coins), listings are matched by name instead. */
export const nameKey = (v) => str(v).toLowerCase().replace(/\s+/g, ' ');
const NO_CERT = /^(n\/?a|none|raw)?$/i;
export const hasCert = (v) => !NO_CERT.test(str(v));

const COMPANY = /^(PCGS|NGC|CACG|CAC|ANACS|ICG)$/;
const GRADE = /^(MS|PR|PF|SP|AU|XF|EF|VF|VG|AG|FR|F|G|P)-?(\d{1,2})(\+?)([A-Z]*)(\+?)$/;
const DESIGNATION = /^(DMPL|DPL|PL|DCAM|CAM|UCAM|UC|BN|RB|RD|FB|FBL|FH|FS|FT|\d?FS)$/;

/**
 * The full grade off the slab, written the way the site does: "MS64 CAC", "MS62DMPL CAC", "MS65 BN CAC",
 * "PF70 UC", "SP70". Taken from the words after the grading company in the description. "CAC" is added
 * when the CAC column says so or the coin is in a CACG holder; "OGH" and pedigree words are left out.
 */
export function gradeOf(description, { cac, company } = {}) {
  const words = str(description).replace(/[(),]/g, ' ').replace(/Ultra Cameo/gi, 'UC').split(/\s+/);
  let i = words.findIndex((w) => COMPANY.test(w));
  const at = (k) => words[k] ?? '';
  // "SP 70" / "PF 70": grade letters and number written apart
  const tryGrade = (k) => (/^[A-Z]{1,2}$/.test(at(k)) && /^\d{1,2}\+?$/.test(at(k + 1)) ? [`${at(k)}${at(k + 1)}`, k + 2] : GRADE.test(at(k)) ? [at(k), k + 1] : null);
  let found = i >= 0 ? tryGrade(i + 1) : null;
  if (!found) for (let k = 0; k < words.length && !found; k++) found = GRADE.test(words[k]) && !/^\d/.test(words[k]) ? tryGrade(k) : null;
  if (!found) return '';
  let [grade, k] = found;
  const parts = [grade];
  while (DESIGNATION.test(at(k))) parts.push(at(k++));
  const isCac = cac === true || /^y/i.test(str(cac)) || company === 'CACG' || words.includes('CAC');
  if (isCac) parts.push('CAC');
  return parts.join(' ');
}

/** "1891-CC ..." -> { dateShown: "1891-CC", date: "1891" }; "328 BC ..." -> { "328 BC", "-328" }. */
export function datesOf(description) {
  const d = str(description);
  const bc = /^(\d{1,4})\s*BC\b/i.exec(d);
  if (bc) return { dateShown: `${bc[1]} BC`, date: `-${bc[1]}` };
  const m = /^(\d{3,4})(\S*)/.exec(d);
  if (!m) return { dateShown: '', date: '' };
  return { dateShown: m[1] + m[2], date: m[1] };
}

const DENOM = /^(\d+\/\d+C|\d+C|H10C|3CN|3CS|[A-Z][a-z]?\$\d+(\.\d+)?|\$\d+(\.\d+)?|Peso)$/;
/** The first word after the date that's a denomination: "50C", "$1", "T$1", "G$10", "1/2C", "Pd$25". */
export function denominationOf(description) {
  const w = str(description).split(/\s+/);
  const d = w.find((x, i) => i > 0 && DENOM.test(x)) ?? (/\bhalf cent\b/i.test(str(description)) ? '1/2C' : '');   // "1854 1/2 … Half Cent"
  return d.replace(/\$(\d+)\.5$/, '$$$1.50');   // "$2.5" -> "$2.50", as the site writes it
}

/**
 * "97199/7199" -> { popNumber: 97199, catalogNumber: 7199 }; "6066" -> both 6066; 0/blank -> none.
 * A single 5-digit number starting 8 or 9 on a coin with a CAM/DMPL-type designation is the designation
 * number written alone (e.g. 97129): its catalog number drops the leading digit, flagged so it's checked.
 */
export function pcgsOf(value, grade = '') {
  const s = str(value);
  const two = /^(\d+)\s*\/\s*(\d+)$/.exec(s);
  if (two) return { popNumber: Number(two[1]), catalogNumber: Number(two[2]) };
  const n = Number(s);
  if (!s || !Number.isFinite(n) || n <= 0) return { popNumber: null, catalogNumber: null };
  if (/^[89]\d{4}$/.test(s) && /(PL|CAM)\b/.test(grade.replace(/(\d)(D?MPL|D?PL|D?CAM)/g, '$1 $2'))) {
    return { popNumber: n, catalogNumber: Number(s.slice(1)), guessed: true };
  }
  return { popNumber: n, catalogNumber: n };
}

export const companyOf = (v) => {
  const s = str(v).toUpperCase();
  return ['PCGS', 'NGC', 'CACG'].includes(s) ? s : s === 'CAC' ? 'CACG' : 'Ungraded';
};

/**
 * Category isn't in the workbook, so it's worked out (Tony reviews it in the preview):
 * ingots -> Vintage Ingot; palladium/platinum -> Other; gold denominations or "Gold" -> Gold;
 * cents, half cents, nickels -> Copper/Bronze; everything else -> Silver.
 */
export function categoryOf({ description, denomination, type }) {
  const d = str(description);
  if (/bar|ingot/i.test(str(type)) || /\bingot\b/i.test(d)) return 'Vintage Ingot';
  if (/^(Pd|Pt)\$/.test(denomination) || /palladium|platinum/i.test(d)) return 'Other';
  if (/^G\$/.test(denomination) || /\bgold\b/i.test(d) || /^\$(2\.5|2\.50|3|5|10|20|50)$/.test(denomination)) return 'Gold';
  if (/^(\d+\/\d+C|1C|2C|3CN|5C)$/.test(denomination)) return 'Copper/Bronze';
  return 'Silver';
}

/** Everything a listing needs from one inventory row. `flags` lists what to double-check in the preview. */
export function listingFromRow(r) {
  const description = str(r.itemDescription);
  const company = companyOf(r.Certification);
  const grade = company === 'Ungraded' ? '' : gradeOf(description, { cac: r.CAC, company });
  const { dateShown, date } = datesOf(description);
  const denomination = denominationOf(description);
  const pcgs = pcgsOf(r['PCGS Num'], grade);
  const price = Number(r.listPrice);
  const flags = [];
  if (!grade && company !== 'Ungraded') flags.push('no grade found in the description');
  if (!date) flags.push('no date found in the description');
  if (!denomination) flags.push('no denomination found in the description');
  if (!pcgs.catalogNumber && company === 'PCGS') flags.push('no PCGS #');
  if (pcgs.guessed) flags.push(`PCGS # ${pcgs.popNumber} looks like a designation # alone; catalog # taken as ${pcgs.catalogNumber}`);
  if (!Number.isFinite(price) || price <= 0) flags.push('no list price');
  return {
    cert: str(r.inventoryID).replace(/_\d{1,2}$/, ''),
    key: certKey(r.inventoryID),
    name: description,
    dateShown, date, denomination, grade,
    gradingCompany: company,
    cac: / CAC$/.test(grade),
    pcgsCatalogNumber: pcgs.catalogNumber,
    pcgsPopNumber: pcgs.popNumber,
    price: Number.isFinite(price) ? price : null,
    category: categoryOf({ description, denomination, type: r.Type }),
    website: str(r.Website).toUpperCase(),
    status: str(r.Status),
    flags,
  };
}
