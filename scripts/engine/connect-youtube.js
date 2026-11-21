/**
 * One-time setup: connect these scripts to the Cabbage Coins YouTube channel.
 *
 * Needs engine/.youtube-client.json: the "Desktop app" client downloaded from Google Cloud
 * (project "Cabbage Coins Scripts" → Google Auth Platform → Clients). Opens Google's sign-in page in
 * the browser, catches the answer on this computer (http://127.0.0.1), and saves a refresh token in
 * engine/.env. Nothing is typed into chat; the secrets stay on this computer.
 *
 * Google shows "Google hasn't verified this app": that's expected for a personal app. Click
 * Advanced → Go to Cabbage Coins Scripts, pick the Cabbage Coins channel, and Allow.
 *
 * Run again any time to reconnect (e.g. if Google says the token was revoked or expired).
 *
 * Usage: node connect-youtube.js
 */

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import process from 'node:process';
import { exec } from 'node:child_process';
import { ENGINE } from './settings.js';
import { saveEnv } from './env-file.js';

export const CLIENT_FILE = path.join(ENGINE, '.youtube-client.json');
// Full YouTube access: needed to change a video's title/description/tags/visibility (upload-only isn't enough).
const SCOPE = 'https://www.googleapis.com/auth/youtube';

function readClient() {
  if (!fs.existsSync(CLIENT_FILE)) {
    throw new Error(`Missing ${CLIENT_FILE}\nDownload the Desktop-app client JSON from Google Cloud and save it with that name.`);
  }
  const j = JSON.parse(fs.readFileSync(CLIENT_FILE, 'utf8'));
  const c = j.installed ?? j.web;
  if (!c?.client_id || !c?.client_secret) throw new Error('That JSON has no client_id/client_secret. Is it the OAuth client file (not an API key)?');
  if (!j.installed) console.log('⚠ This client is not a "Desktop app" type; if Google refuses the sign-in, create a Desktop app client instead.');
  return c;
}

/** Starts a little server on http://127.0.0.1:<free port>/ that waits for Google to send the browser back with ?code=… */
async function startCatcher(state) {
  let done;
  const answer = new Promise((resolve, reject) => { done = { resolve, reject }; });
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://127.0.0.1');
    if (u.pathname !== '/') { res.writeHead(404); res.end(); return; }
    const code = u.searchParams.get('code');
    const ok = code && u.searchParams.get('state') === state;
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<html><body style="font-family:sans-serif;padding:3em"><h2>${ok ? '✔ Connected. You can close this tab.' : '✗ Something went wrong — see the black window.'}</h2></body></html>`);
    server.close();
    const err = u.searchParams.get('error');
    if (ok) done.resolve(code);
    else done.reject(new Error(err ? `Google said: ${err}` : 'The answer from Google did not match. Run this again.'));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  setTimeout(() => { server.close(); done.reject(new Error('No answer from Google after 10 minutes. Run this again.')); }, 10 * 60 * 1000).unref();
  return { redirect: `http://127.0.0.1:${server.address().port}`, answer };
}

async function main() {
  const client = readClient();
  const state = crypto.randomBytes(16).toString('hex');
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');

  const { redirect, answer } = await startCatcher(state);

  const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
    client_id: client.client_id, redirect_uri: redirect, response_type: 'code', scope: SCOPE,
    access_type: 'offline', prompt: 'consent', state, code_challenge: challenge, code_challenge_method: 'S256',
  });
  console.log('Connect to YouTube (one time)\n');
  console.log('Opening Google in your browser. Sign in with the account that owns the Cabbage Coins channel.');
  console.log('"Google hasn\'t verified this app" is expected: Advanced → Go to Cabbage Coins Scripts → pick the channel → Allow.');
  console.log('(If the browser doesn\'t open, paste this into it:)\n' + url + '\n');
  exec(`start "" "${url}"`);

  const code = await answer;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code, client_id: client.client_id, client_secret: client.client_secret,
      redirect_uri: redirect, grant_type: 'authorization_code', code_verifier: verifier,
    }),
  });
  const tok = await res.json();
  if (!res.ok || !tok.refresh_token) {
    throw new Error(`Google refused (${res.status}): ${tok.error_description ?? tok.error ?? JSON.stringify(tok)}. Run this again.`);
  }
  saveEnv({ YOUTUBE_CLIENT_ID: client.client_id, YOUTUBE_CLIENT_SECRET: client.client_secret, YOUTUBE_REFRESH_TOKEN: tok.refresh_token });

  // Prove it: ask YouTube which channel this is.
  const ch = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', {
    headers: { Authorization: `Bearer ${tok.access_token}` },
  }).then((r) => r.json());
  const name = ch.items?.[0]?.snippet?.title;
  if (!name) {
    console.log(`\n⚠ Saved, but YouTube returned no channel: ${ch.error?.message ?? 'this Google account has no channel'}.`);
    console.log('If the channel belongs to a different account (or a Brand Account), run this again and pick it.');
    return;
  }
  console.log(`\n✔ Connected to YouTube channel "${name}" (${ch.items[0].id}).`);
  console.log('If that\'s not the Cabbage Coins channel, run this again and pick the right one.');
}

main().catch((err) => {
  console.error(`\n✗ ${err.message}`);
  process.exitCode = 1;
});
