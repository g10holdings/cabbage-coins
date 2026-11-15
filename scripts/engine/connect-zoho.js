/**
 * One-time setup: connect these scripts to Tony's Zoho BILLING account (invoices INV-…, quotes used as purchase
 * orders PO-…), READ ONLY.
 *
 * Works out the data center and organization from the address of a Billing page, walks through making a "Self
 * Client" in Zoho's API console, and trades the one-time code for a refresh token that doesn't expire. Everything is
 * saved in engine/.env (old file kept as .env.bak). Nothing is typed into chat; the secrets stay on this computer.
 * The permissions asked for are all .READ: these scripts can't create, change or delete anything in Zoho.
 *
 * Run again any time to reconnect: it reuses the saved Client ID and Secret.
 *
 * Usage: node connect-zoho.js   (Extras\Connect-Zoho)
 */

import process from 'node:process';
import readline from 'node:readline/promises';
import { exec } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import dotenv from 'dotenv';
import { ENV_FILE, saveEnv } from './env-file.js';
import { zohoGet } from './zoho.js';

dotenv.config({ path: ENV_FILE });

// Read-only, names checked against the Billing API docs (2026-11-14): invoices, quotes, payments received,
// customers, and the organization list (settings).
export const SCOPES = ['invoices', 'quotes', 'payments', 'customers', 'settings']
  .map((s) => `ZohoSubscriptions.${s}.READ`);

/** "https://billing.zoho.com/app/712345678#/invoices/new" → { tld: 'com', orgId: '712345678' }; null if not Billing. */
export function parseZohoAddress(text) {
  let u;
  try { u = new URL(text.trim()); } catch { return null; }
  const m = /^billing\.zoho(?:cloud)?\.([a-z.]+)$/i.exec(u.hostname);
  if (!m) return null;
  const orgId = /\/app\/(\d{5,})/.exec(u.pathname + u.hash)?.[1] ?? null;
  return { tld: m[1].toLowerCase(), orgId };
}

/** Zoho's sign-in and console servers for a data center (Canada is on zohocloud.ca). */
export function zohoServers(tld) {
  const domain = tld === 'ca' ? 'zohocloud.ca' : `zoho.${tld}`;
  return { accountsUrl: `https://accounts.${domain}`, consoleUrl: `https://api-console.${domain}` };
}

async function main() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = async (label) => {
    const v = (await rl.question(label)).trim();
    if (!v) throw new Error('Nothing entered.');
    return v;
  };

  console.log('Connect to Zoho Billing (one time, read only)\n');
  console.log('1) Open Zoho Billing (any page, e.g. your invoices). Click the address bar, copy the WHOLE address,');
  console.log('   and paste it here.');
  let where = parseZohoAddress(await ask('   Address: '));
  while (!where) {
    console.log('   That doesn\'t look like a billing.zoho.… address. Copy it from a Zoho Billing page and try again.');
    where = parseZohoAddress(await ask('   Address: '));
  }
  const { accountsUrl, consoleUrl } = zohoServers(where.tld);
  console.log(`   → Zoho Billing, data center zoho.${where.tld}${where.orgId ? `, organization ${where.orgId}` : ''}\n`);

  console.log(`2) In the Zoho API Console (opening ${consoleUrl} now; sign in as the same Zoho user):`);
  console.log('   a. Click "Add Client" (or "Get Started"), choose "Self Client", click Create, then OK.');
  console.log('   b. On the "Client Secret" tab, copy the Client ID and Client Secret into this window.');
  exec(`start "" "${consoleUrl}"`);
  const saved = process.env.ZOHO_CLIENT_ID?.trim() && process.env.ZOHO_CLIENT_SECRET?.trim();
  if (saved) console.log('   (Using the Client ID and Secret saved last time.)');
  const clientId = process.env.ZOHO_CLIENT_ID?.trim() || await ask('   Client ID: ');
  const clientSecret = process.env.ZOHO_CLIENT_SECRET?.trim() || await ask('   Client Secret: ');
  saveEnv({ ZOHO_CLIENT_ID: clientId, ZOHO_CLIENT_SECRET: clientSecret });

  console.log('\n3) On the "Generate Code" tab, fill in:');
  console.log(`     Scope:              ${SCOPES.join(',')}`);
  console.log('     Time Duration:      10 minutes');
  console.log('     Scope Description:  Cabbage Coins scripts (read only)');
  console.log('   Click Create. If it asks which organization/portal, pick your business. Copy the code it shows.');
  const code = await ask('   Code: ');

  const res = await fetch(`${accountsUrl}/oauth/v2/token`, {
    method: 'POST',
    body: new URLSearchParams({ grant_type: 'authorization_code', client_id: clientId, client_secret: clientSecret, code }),
  });
  const tok = await res.json().catch(() => ({}));
  if (!tok.refresh_token) {
    rl.close();
    const why = tok.error === 'invalid_code'
      ? 'that code was already used or ran out of time. Make a new one on the Generate Code tab and run this again.'
      : tok.error === 'invalid_client'
        ? 'the Client ID or Secret is wrong. Delete the ZOHO_CLIENT_ID and ZOHO_CLIENT_SECRET lines from engine\\.env and run this again.'
        : (tok.error ?? `status ${res.status}`);
    throw new Error(`Zoho didn't connect: ${why}`);
  }
  const apiUrl = tok.api_domain || `https://www.zohoapis.${where.tld}`;
  saveEnv({ ZOHO_REFRESH_TOKEN: tok.refresh_token, ZOHO_ACCOUNTS_URL: accountsUrl, ZOHO_API_URL: apiUrl });

  // Prove it: which organization(s) can we see, then the newest invoice and quote.
  const conn = { apiUrl, token: tok.access_token };
  const orgs = (await zohoGet('organizations', {}, conn)).organizations ?? [];
  if (!orgs.length) throw new Error('Connected, but this Zoho user has no Zoho Billing organization.');
  let org = orgs.find((o) => String(o.organization_id) === where.orgId) ?? (orgs.length === 1 ? orgs[0] : null);
  if (!org) {
    orgs.forEach((o, i) => console.log(`   ${i + 1}. ${o.name} (${o.organization_id})`));
    org = orgs[Number(await ask('   Which one is the business? Number: ')) - 1];
    if (!org) throw new Error('No organization picked: run this again.');
  }
  rl.close();
  saveEnv({ ZOHO_ORG_ID: String(org.organization_id) });

  conn.orgId = String(org.organization_id);
  const newest = async (endpoint, key, show) => {
    const r = (await zohoGet(endpoint, { per_page: 1, sort_column: 'created_time', sort_order: 'D' }, conn))[key]?.[0];
    return r ? show(r) : 'none yet';
  };
  console.log(`\n✔ Connected to Zoho Billing: "${org.name}" (read only).`);
  console.log(`  Newest invoice: ${await newest('invoices', 'invoices',
    (r) => `${r.invoice_number ?? r.number} (${r.invoice_date ?? r.date}, ${r.customer_name})`)}`);
  console.log(`  Newest quote:   ${await newest('estimates', 'estimates',
    (r) => `${r.estimate_number} (${r.date}, ${r.customer_name})`)}`);
  console.log('\nThat\'s it. Tell Claude it\'s connected.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(`\n✗ ${err.message}`);
    process.exit(1);   // not exitCode: an open question prompt would otherwise keep the window waiting
  });
}
