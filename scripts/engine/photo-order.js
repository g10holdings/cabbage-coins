/**
 * Marketplace photo order: slab shots first, then the close-ups (Tony, 2026-10-18: that's how eBay and CAC
 * buyers expect it; the website itself shows close-ups first). Used by ebay-sync.js and cac-marketplace.js.
 *
 * Tony's close-ups carry the gold Cabbage Coins logo bottom-left and the slab shots don't: the logo's gold head
 * averages about rgb(97,82,62) on every close-up, while slab shots read black or grey there (all 77 coins
 * checked, 2026-10-18). File names don't tell: "-1" is the slab on some coins and the close-up on others.
 */

import zlib from 'node:zlib';

/** True when the Sanity image has the logo, i.e. is a close-up. Sanity crops the spot and shrinks it to one pixel. */
export async function isCloseUp(url) {
  const [, w, h] = /-(\d+)x(\d+)\.\w+$/.exec(url) ?? [];
  if (!w || w !== h) return false;
  const rect = [115, 905, 45, 70].map((n) => Math.round((n * Number(w)) / 1044)).join(',');
  const res = await fetch(`${url}?rect=${rect}&w=1&h=1&fm=png`);
  if (!res.ok) return false;
  const png = Buffer.from(await res.arrayBuffer());
  const idat = [];
  for (let o = 8; o + 8 <= png.length; o += 12 + png.readUInt32BE(o)) {
    if (png.toString('ascii', o + 4, o + 8) === 'IDAT') idat.push(png.subarray(o + 8, o + 8 + png.readUInt32BE(o)));
  }
  const [, r, g, b] = zlib.inflateSync(Buffer.concat(idat));   // byte 0 is the row filter, a no-op on a lone pixel
  return Math.abs(r - 97) < 15 && Math.abs(g - 82) < 15 && Math.abs(b - 62) < 15;
}

/** The same photos, everything without the logo (slab shots) first, then the close-ups; otherwise in site order. */
export async function slabsFirst(urls) {
  const close = await Promise.all(urls.map(isCloseUp));
  return [...urls.filter((u, i) => !close[i]), ...urls.filter((u, i) => close[i])];
}
