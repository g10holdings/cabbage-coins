/**
 * Talks to Tony's Zoho BILLING account (billing.zoho.com: invoices INV-…, quotes used as purchase orders PO-…), READ ONLY.
 * API docs: https://www.zoho.com/billing/api/v1/introduction/ (Zoho Billing was "Zoho Subscriptions", hence the
 * ZohoSubscriptions.* permission names and the organization header).
 *
 * Setup is one time: Extras\Connect-Zoho (connect-zoho.js) saves these in engine/.env:
 *   ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN   the "Self Client" keys + the long-lived token
 *   ZOHO_ACCOUNTS_URL   e.g. https://accounts.zoho.com (the data center the account lives in)
 *   ZOHO_API_URL        e.g. https://www.zohoapis.com
 *   ZOHO_ORG_ID         the organization (company) id
 *
 * The refresh token doesn't expire; it buys a 1-hour access token, kept in .zoho-access.json so a run doesn't ask
 * Zoho for a new one each time (Zoho limits how often you may).
 *
 * Limits (Billing docs): about 30 calls a minute, and 1,000 a day on the Standard plan (5,000 on Premium). Calls here
 * are spaced ~2 s apart; a "daily limit" answer (code 45) stops the run instead of retrying.
 * In the API, Zoho calls Quotes "estimates".
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });
const TOKEN_CACHE = path.join(__dirname, '.zoho-access.json');
const CALL_GAP_MS = 2100;

const env = (k) => process.env[k]?.trim();

export function zohoConfigured() {
  return ['ZOHO_CLIENT_ID', 'ZOHO_CLIENT_SECRET', 'ZOHO_REFRESH_TOKEN', 'ZOHO_ACCOUNTS_URL', 'ZOHO_API_URL',
    'ZOHO_ORG_ID'].every(env);
}

/** Seconds an access token lasts: older Zoho answers gave milliseconds in expires_in and seconds in expires_in_sec. */
export function tokenLifetimeSeconds(answer) {
  if (answer.expires_in_sec) return Number(answer.expires_in_sec);
  const n = Number(answer.expires_in);
  if (!n) return 3600;
  return n > 86400 ? n / 1000 : n;
}

async function accessToken() {
  const refreshToken = env('ZOHO_REFRESH_TOKEN');
  try {
    const c = JSON.parse(fs.readFileSync(TOKEN_CACHE, 'utf8'));
    if (c.until > Date.now() + 120_000 && c.refreshTail === refreshToken.slice(-6)) return c.token;
  } catch { /* none saved yet */ }
  const res = await fetch(`${env('ZOHO_ACCOUNTS_URL')}/oauth/v2/token`, {
    method: 'POST',
    body: new URLSearchParams({ grant_type: 'refresh_token', client_id: env('ZOHO_CLIENT_ID'),
      client_secret: env('ZOHO_CLIENT_SECRET'), refresh_token: refreshToken }),
  });
  const j = await res.json().catch(() => ({}));
  if (!j.access_token) throw new Error(`Zoho wouldn't renew access (${res.status}: ${j.error ?? 'no token'}). Run Extras\\Connect-Zoho again.`);
  const until = Date.now() + tokenLifetimeSeconds(j) * 1000;
  fs.writeFileSync(TOKEN_CACHE, JSON.stringify({ token: j.access_token, until, refreshTail: refreshToken.slice(-6) }));
  return j.access_token;
}

/** Build the request for one Billing API call (organization goes in a header; the docs list no query option). */
export function zohoRequest({ apiUrl, orgId, token }, endpoint, params = {}) {
  const url = new URL(`${apiUrl}/billing/v1/${endpoint}`);
  for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, v);
  const headers = { Authorization: `Zoho-oauthtoken ${token}` };
  if (orgId) headers['X-com-zoho-subscriptions-organizationid'] = orgId;
  return { url, headers };
}

let calls = 0;
let lastCall = 0;
/** API calls made by this run (Zoho caps calls per day, so the pull script reports it). */
export const zohoCallCount = () => calls;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * One GET with the saved connection, or with an explicit { apiUrl, orgId, token } (connect-zoho.js, before the
 * organization is saved). Spaces calls out, waits out a per-minute block, stops on the daily limit.
 */
export async function zohoGet(endpoint, params = {}, conn = null) {
  if (!conn && !zohoConfigured()) throw new Error('Zoho isn\'t connected yet: double-click Extras\\Connect-Zoho first.');
  for (let attempt = 1; ; attempt++) {
    const wait = lastCall + CALL_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastCall = Date.now();
    const { url, headers } = zohoRequest(conn ?? { apiUrl: env('ZOHO_API_URL'), orgId: env('ZOHO_ORG_ID'),
      token: await accessToken() }, endpoint, params);
    calls++;
    const res = await fetch(url, { headers });
    const j = await res.json().catch(() => ({}));
    if (res.ok && j.code === 0) return j;
    const err = new Error(`Zoho ${endpoint}: ${j.message ?? res.statusText} (${res.status}, code ${j.code ?? '?'})`);
    err.status = res.status;
    err.daily = j.code === 45;                    // "exceeded the maximum call rate limit" for the day
    if (res.status === 429 && !err.daily && attempt <= 3) {
      const secs = Number(res.headers.get('retry-after')) || 60;
      console.log(`  (Zoho asked to slow down; waiting ${secs}s)`);
      await sleep(secs * 1000);
      continue;
    }
    throw err;
  }
}

/** Every record of a list endpoint (invoices, estimates, payments…), 200 per page. */
export async function zohoList(endpoint, key, params = {}) {
  const all = [];
  for (let page = 1; ; page++) {
    const j = await zohoGet(endpoint, { ...params, page, per_page: 200 });
    all.push(...(j[key] ?? []));
    if (!j.page_context?.has_more_page) return all;
  }
}
