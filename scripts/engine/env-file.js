/**
 * Saving keys into engine/.env, shared by the one-time connect scripts (connect-ebay.js, connect-zoho.js).
 * Keeps every other line exactly as it was, and keeps the previous file as .env.bak.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ENV_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '.env');

/** Set keys in .env, keeping every other line exactly as it was. */
export function saveEnv(values) {
  const old = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, 'utf8') : '';
  if (old) fs.writeFileSync(`${ENV_FILE}.bak`, old);
  const lines = old.split(/\r?\n/);
  for (const [key, value] of Object.entries(values)) {
    // Quoted: eBay tokens contain "#", which .env otherwise reads as the start of a comment (cutting the token to 5 chars).
    const line = `${key}="${String(value).replace(/"/g, '\\"')}"`;
    const i = lines.findIndex((l) => l.startsWith(`${key}=`));
    if (i >= 0) lines[i] = line;
    else lines.splice(lines.at(-1) === '' ? lines.length - 1 : lines.length, 0, line);
  }
  fs.writeFileSync(ENV_FILE, lines.join('\n'));
  // The PCGS token once vanished from .env during an edit: make sure nothing else was lost.
  const now = fs.readFileSync(ENV_FILE, 'utf8');
  const missing = old.split(/\r?\n/).map((l) => /^([A-Za-z_][A-Za-z0-9_]*)=/.exec(l)?.[1]).filter(Boolean)
    .filter((k) => !now.includes(`${k}=`));
  if (missing.length) throw new Error(`.env lost ${missing.join(', ')} — restore it from .env.bak`);
}
