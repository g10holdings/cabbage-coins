/**
 * A listing's 4 website photos, made by 1_Prep-Photos (Prep-Photos.ps1), and putting them on its draft.
 *
 * Each coin's photo folder in waiting_website ENDS with its cert # (Tony types it on export from Lightroom;
 * photo-folders.js then renames the folder from the workbook). The files carry the name without the cert:
 *   "1895-O-10-Dollar-Liberty-Head-Eagle-PCGS-MS62-59080489\1895-O-10-Dollar-Liberty-Head-Eagle-PCGS-MS62-1.jpg" ... "-4.jpg"
 * (-1 obverse slab, -2 obverse close-up, -3 reverse slab, -4 reverse close-up).
 *
 * Slots, as on every live listing (checked 2026-10-18): the main image is the obverse close-up, then the
 * gallery holds the reverse close-up, the obverse slab and the reverse slab.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const PHOTO_ROOT = process.env.PHOTO_ROOT || 'D:/OneDrive/Cabbage Coins/Inventory Photos/waiting_website';
const SLOTS = [2, 4, 1, 3];   // file number for: main image, then the 3 gallery images

export function photoFolders(root = PHOTO_ROOT) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
}

/**
 * The workbook's item description as a file name: the photos' names (and so what search engines read) match the
 * listing. "1934-D $1 Peace Silver Dollar PCGS MS65 CAC (Toned)" -> "1934-D-1-Dollar-Peace-Silver-Dollar-PCGS-MS65-CAC-Toned".
 */
export function fileBase(description) {
  return String(description ?? '')
    .replace(/(?:\b([A-Za-z]{1,2}))?\$(\d+(?:\.\d+)?)/g, (m, pre, n) => ` ${n} Dollar${pre && /^g$/i.test(pre) ? ' Gold' : ''} `)
    .replace(/\+/g, ' Plus ')
    .replace(/&/g, ' and ')
    .replace(/[^A-Za-z0-9.]+/g, '-')
    .replace(/\.(?!\d)|(?<!\d)\./g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 110)
    .replace(/-+$/, '');
}

/**
 * Where the cert # sits in a folder name, if it's there: at the end after a dash, space or underscore (the
 * convention), or at the start (the 12 folders named that way for a few hours on 2026-10-18). Returns the rest of
 * the name (what Tony typed) or null.
 */
export function splitCert(folder, cert) {
  const c = String(cert ?? '').trim().toLowerCase();
  const f = folder.toLowerCase();
  if (!c || c === 'n/a') return null;
  if (f.endsWith(c) && /[-_ ]$/.test(folder.slice(0, folder.length - c.length))) return folder.slice(0, folder.length - c.length - 1).replace(/[-_ ]+$/, '');
  if (f.startsWith(c) && /^[-_ ]/.test(folder.slice(c.length))) return folder.slice(c.length + 1).replace(/^[-_ ]+/, '');
  return null;
}

/** The folder carrying this cert #, and whether its 4 photos exist. */
export function findPhotos(cert, folders, root = PHOTO_ROOT) {
  const folder = folders.find((f) => splitCert(f, cert) != null);
  if (!folder) return null;
  const base = splitCert(folder, cert);
  const files = SLOTS.map((n) => path.join(root, folder, `${base}-${n}.jpg`));
  return { folder, files, ready: files.every((f) => fs.existsSync(f)) };
}

/** Uploads the 4 photos and puts them on the draft. Keeps the alt text and caption already on the main image. */
export async function putPhotos(client, draft, found) {
  const assets = [];
  for (const f of found.files) assets.push(await client.assets.upload('image', fs.createReadStream(f), { filename: path.basename(f) }));
  const ref = (a) => ({ _type: 'reference', _ref: a._id });
  const [main, ...rest] = assets;
  await client.patch(draft._id)
    .set({
      image: { ...(draft.image ?? {}), _type: 'mainImage', asset: ref(main) },
      imagesGallery: rest.map((a) => ({ _type: 'image', _key: crypto.randomBytes(6).toString('hex'), asset: ref(a) })),
    })
    .commit();
}

/** One line saying where a listing's photos stand. */
export function photoStatus(cert, found) {
  if (!found) return `no photo folder ending in "${cert || '(no cert)'}" (fine for ingots and one-offs: add those photos in the Studio)`;
  if (!found.ready) return `folder "${found.folder}" found, but its 4 photos aren't made yet (run 1_Prep-Photos)`;
  return `ready in "${found.folder}"`;
}
