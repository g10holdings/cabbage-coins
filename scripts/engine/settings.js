/**
 * The one place the scripts learn where things are (settings.json) and get their secrets (.env).
 *
 * settings.json holds the paths, the Sanity project and the like. Relative paths are relative to this folder.
 * A few environment variables still override it, for testing or a moved file: WORKBOOK_PATH, PHOTO_ROOT,
 * SANITY_PROJECT_ID, SANITY_DATASET.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { createClient } from '@sanity/client';

export const ENGINE = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(ENGINE, '.env') });

const raw = JSON.parse(fs.readFileSync(path.join(ENGINE, 'settings.json'), 'utf8'));
const abs = (p) => (p ? path.resolve(ENGINE, p) : p);

export const settings = {
  workbook: process.env.WORKBOOK_PATH || abs(raw.workbook),
  photos: {
    inProgress: process.env.PHOTO_ROOT || abs(raw.photos.inProgress),
    listed: abs(raw.photos.listed),
    sold: abs(raw.photos.sold),
    logo: abs(raw.photos.logo),
    cacLogo: abs(raw.photos.cacLogo),
  },
  sanity: {
    projectId: process.env.SANITY_PROJECT_ID || raw.sanity.projectId,
    dataset: process.env.SANITY_DATASET || raw.sanity.dataset,
    apiVersion: raw.sanity.apiVersion,
  },
  ebayPromoImage: raw.ebayPromoImage,
};

/**
 * A Sanity client. Reads use the token too (drafts are only visible with it).
 * `requireToken`: stop with a plain message when SANITY_WRITE_TOKEN is missing.
 */
export function sanity({ requireToken = true, apiVersion = settings.sanity.apiVersion } = {}) {
  const token = process.env.SANITY_WRITE_TOKEN;
  if (requireToken && !token) {
    console.error('SANITY_WRITE_TOKEN is not set. Add it to scripts/engine/.env (Editor-permission token).');
    process.exit(1);
  }
  return createClient({ projectId: settings.sanity.projectId, dataset: settings.sanity.dataset, apiVersion, token, useCdn: false });
}
