/**
 * One-time setup: connect these scripts to Tony's eBay seller account (cabbage_coins).
 *
 * Asks for the three values from the eBay developer portal (App ID, Cert ID, RuName), opens eBay's
 * sign-in page, and turns the "you've agreed" page address into a refresh token, which lets the
 * scripts act for the account for about 18 months. Everything is saved in engine/.env (a backup of
 * the old file is kept as .env.bak). Nothing is typed into chat; the secrets stay on this computer.
 *
 * Run again any time to reconnect (e.g. when the 18 months are up): it reuses the saved keys.
 *
 * Usage: node connect-ebay.js
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import readline from 'node:readline/promises';
import { exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_FILE = path.join(__dirname, '.env');
dotenv.config({ path: ENV_FILE });

// What the scripts may do on the account: list/revise/end items (inventory), read business policies
// (account), and see orders, to notice coins that sold on eBay (fulfillment).
const SCOPES = [
  'https://api.ebay.com/oauth/api_scope',
  'https://api.ebay.com/oauth/api_scope/sell.inventory',
  'https://api.ebay.com/oauth/api_scope/sell.account',
  'https://api.ebay.com/oauth/api_scope/sell.fulfillment',
];

/** Set keys in .env, keeping every other line exactly as it was. */
function saveEnv(values) {
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

async function main() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = async (label, current) => {
    if (current) return current;
    const v = (await rl.question(`${label}: `)).trim();
    if (!v) throw new Error(`${label} is needed.`);
    return v;
  };

  console.log('Connect to eBay (one time)\n');
  console.log('From developer.ebay.com → Application Keysets → your Production keyset:');
  const appId = await ask('  App ID (Client ID)', process.env.EBAY_APP_ID);
  const certId = await ask('  Cert ID (Client Secret)', process.env.EBAY_CERT_ID);
  console.log('From the same keyset → User Tokens → "Get a Token from eBay via Your Application":');
  const ruName = await ask('  RuName (eBay Redirect URL name)', process.env.EBAY_RUNAME);
  saveEnv({ EBAY_APP_ID: appId, EBAY_CERT_ID: certId, EBAY_RUNAME: ruName });

  const url = 'https://auth.ebay.com/oauth2/authorize?' + new URLSearchParams({
    client_id: appId, response_type: 'code', redirect_uri: ruName, scope: SCOPES.join(' '),
  });
  console.log('\nOpening eBay in your browser. Sign in as cabbage_coins and press "Agree".');
  console.log('(If it doesn\'t open, paste this into the browser:)\n' + url + '\n');
  exec(`start "" "${url}"`);
  const landed = (await rl.question('Then copy the FULL address of the page eBay shows next, and paste it here:\n> ')).trim();
  rl.close();

  const code = new URL(landed).searchParams.get('code');
  if (!code) throw new Error('That address has no "code" in it. Run this again and copy the address after pressing Agree.');

  const res = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${appId}:${certId}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: ruName }),
  });
  const tok = await res.json();
  if (!res.ok || !tok.refresh_token) {
    throw new Error(`eBay refused (${res.status}): ${tok.error_description ?? tok.error ?? JSON.stringify(tok)}. `
      + 'The code only works once and for a few minutes: run this again.');
  }
  const until = new Date(Date.now() + tok.refresh_token_expires_in * 1000).toISOString().slice(0, 10);
  saveEnv({ EBAY_REFRESH_TOKEN: tok.refresh_token, EBAY_REFRESH_TOKEN_UNTIL: until });

  // Prove it: ask eBay whose account this is (Trading API GetUser, with the new token).
  const who = await fetch('https://api.ebay.com/ws/api.dll', {
    method: 'POST',
    headers: {
      'X-EBAY-API-CALL-NAME': 'GetUser', 'X-EBAY-API-SITEID': '0', 'X-EBAY-API-COMPATIBILITY-LEVEL': '1349',
      'X-EBAY-API-IAF-TOKEN': tok.access_token, 'Content-Type': 'text/xml',
    },
    body: '<?xml version="1.0" encoding="utf-8"?><GetUserRequest xmlns="urn:ebay:apis:eBLBaseComponents"/>',
  }).then((r) => r.text());
  const user = /<UserID>([^<]+)<\/UserID>/.exec(who)?.[1];
  console.log(`\n✔ Connected${user ? ` to eBay account "${user}"` : ''}. Good until ${until}; run this again before then.`);
  if (user && user !== 'cabbage_coins') console.log(`⚠ That's not cabbage_coins. If it's the wrong account, run this again and sign in as cabbage_coins.`);
}

main().catch((err) => {
  console.error(`\n✗ ${err.message}`);
  process.exitCode = 1;
});
