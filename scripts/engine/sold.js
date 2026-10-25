/**
 * Is a coin sold? The WORKBOOK says so first (it's the source of truth: Tony marks a sale there), the website's
 * Sold box second. Used by all three parts of 4_After-Publishing-or-Selling, so a coin marked Sold only in the
 * workbook still has its photos filed, comes off CAC, and is ended on eBay (and never listed again).
 *
 * Matching: by cert # (a trailing "_2" row is the same coin back in stock, so a cert counts as sold only when
 * EVERY row for it says Sold); items with no cert, like the ingots, by name, and only if every row of that name is Sold.
 */

import { readInventory, certKey, nameKey, hasCert } from './workbook.js';

// Listings whose workbook row says Sold on purpose (Tony, 2026-10-17); also skipped by status-report.js.
export const STAND_INS = new Map([
  ['6042153-049', '2020-W Palladium Eagle: a stand-in listing; Tony shows one of several at a time'],
]);

const isSold = (r) => /^sold$/i.test(String(r.Status ?? '').trim());

/**
 * Reads the workbook once and returns soldInWorkbook(listing) -> true / false (false also when there's no row).
 * `rows` can be passed in (tests, or a caller that already read the workbook).
 */
export function workbookSales(rows = readInventory().rows) {
  const byCert = new Map(), byName = new Map();
  const add = (map, key, r) => { const s = map.get(key) ?? { sold: 0, active: 0 }; s[isSold(r) ? 'sold' : 'active']++; map.set(key, s); };
  for (const r of rows) {
    if (r.inventoryID == null) continue;
    if (hasCert(r.inventoryID)) add(byCert, certKey(r.inventoryID), r);
    add(byName, nameKey(r.itemDescription), r);
  }
  const allSold = (s) => !!s && s.sold > 0 && s.active === 0;
  return (listing) => {
    const cert = hasCert(listing.gradenumber) ? certKey(listing.gradenumber) : null;
    if (cert && STAND_INS.has(cert)) return false;
    // Names repeat (several 1881-S MS66s have sold), so a coin with a cert is never judged by its name.
    return allSold(cert ? byCert.get(cert) : byName.get(nameKey(listing.name)));
  };
}
