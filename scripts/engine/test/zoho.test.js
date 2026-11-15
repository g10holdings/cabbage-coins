// The Zoho Billing connection (connect-zoho.js, zoho.js, zoho-pull.js): the parts that work without a live account.
// Sample records are trimmed from the Billing API docs (https://www.zoho.com/billing/api/v1/), 2026-11-14.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseZohoAddress, zohoServers, SCOPES } from '../connect-zoho.js';
import { tokenLifetimeSeconds, zohoRequest } from '../zoho.js';
import { normalize, detailRecord, needingDetails } from '../zoho-pull.js';

test('a Zoho Billing page address gives the data center and organization', () => {
  assert.deepEqual(parseZohoAddress('https://billing.zoho.com/app/712345678#/invoices/new'),
    { tld: 'com', orgId: '712345678' });
  assert.deepEqual(parseZohoAddress(' https://billing.zoho.eu/app/123456#/quotes '), { tld: 'eu', orgId: '123456' });
  assert.deepEqual(parseZohoAddress('https://billing.zoho.com/app#/home'), { tld: 'com', orgId: null });
  assert.equal(parseZohoAddress('https://books.zoho.com/app/712345678#/invoices'), null);   // Books, not Billing
  assert.equal(parseZohoAddress('billing.zoho.com'), null);                                 // not a full address
});

test('sign-in servers per data center; Canada is on zohocloud.ca', () => {
  assert.deepEqual(zohoServers('com'), { accountsUrl: 'https://accounts.zoho.com', consoleUrl: 'https://api-console.zoho.com' });
  assert.equal(zohoServers('ca').accountsUrl, 'https://accounts.zohocloud.ca');
});

test('only read permissions are asked for', () => {
  assert.ok(SCOPES.every((s) => /^ZohoSubscriptions\.[a-z]+\.READ$/.test(s)));
  assert.ok(SCOPES.includes('ZohoSubscriptions.quotes.READ'));
});

test('access-token lifetime: seconds, or the old milliseconds answer', () => {
  assert.equal(tokenLifetimeSeconds({ expires_in: 3600 }), 3600);
  assert.equal(tokenLifetimeSeconds({ expires_in: 3600000, expires_in_sec: 3600 }), 3600);
  assert.equal(tokenLifetimeSeconds({ expires_in: 3600000 }), 3600);
  assert.equal(tokenLifetimeSeconds({}), 3600);
});

test('requests go to billing/v1 with the organization in its header', () => {
  const r = zohoRequest({ apiUrl: 'https://www.zohoapis.com', orgId: '712345678', token: 't' }, 'invoices', { page: 2, x: null });
  assert.equal(r.url.href, 'https://www.zohoapis.com/billing/v1/invoices?page=2');
  assert.deepEqual(r.headers, { Authorization: 'Zoho-oauthtoken t', 'X-com-zoho-subscriptions-organizationid': '712345678' });
  assert.deepEqual(zohoRequest({ apiUrl: 'https://www.zohoapis.com', token: 't' }, 'organizations').headers,
    { Authorization: 'Zoho-oauthtoken t' });
});

test('list records get one set of field names (Billing\'s invoice and payment lists use their own)', () => {
  assert.deepEqual(normalize.invoice({ invoice_id: '903000000079426', number: 'INV-384', status: 'paid',
    invoice_date: '2016-06-05', customer_name: 'Bowman Furniture', balance: 0, total: 370,
    updated_time: '2016-06-05T02:15:15-0700' }),
  { id: '903000000079426', number: 'INV-384', date: '2016-06-05', customer_name: 'Bowman Furniture', total: 370,
    balance: 0, status: 'paid', changed: '2016-06-05T02:15:15-0700' });
  const q = normalize.quote({ estimate_id: 982000000567011, customer_name: 'Bowman & Co', status: 'draft',
    estimate_number: 'EST-00002', reference_number: 'QRT-12346', date: '2013-11-18', total: 40.6,
    last_modified_time: '2013-12-18T04:46:45-0500' });
  assert.equal(q.id, '982000000567011');
  assert.equal(q.number, 'EST-00002');
  assert.equal(q.changed, '2013-12-18T04:46:45-0500');
  const p = normalize.payment({ payment_id: '9030000079467', invoice_number: 'INV-384', date: '2016-06-05',
    mode: 'cash', status: 'success', amount: 450, customer_name: 'Bowman Furniture' });
  assert.equal(p.payment_mode, 'cash');
  assert.equal(p.invoice_number, 'INV-384');
});

test('detail records: invoice coins come from invoice_items (price), quote coins from line_items (rate)', () => {
  const inv = detailRecord('invoice', { invoice_number: 'INV-384', date: '2016-06-05', total: 370,
    invoice_items: [{ name: 'Basic', description: 'd', price: 50, quantity: 1, item_total: 400 }],
    payments: [{ payment_id: '90300000079467', payment_mode: 'autotransaction', date: '2016-06-05', amount: 370,
      reference_number: 'INV-384' }] }, { number: 'INV-384', changed: 't1' });
  assert.deepEqual(inv.line_items, [{ name: 'Basic', description: 'd', quantity: 1, price: 50, item_total: 400 }]);
  assert.equal(inv.payments[0].amount, 370);
  assert.equal(inv.changed, 't1');
  const quote = detailRecord('estimate', { date: '2013-11-18',
    line_items: [{ name: 'Hard Drive', rate: 120, quantity: 1, item_total: 120 }] }, { number: 'PO-000101' });
  assert.equal(quote.line_items[0].price, 120);
  assert.deepEqual(quote.payments, []);
});

test('line items are fetched only for new or changed records', () => {
  const list = [{ id: '1', changed: 'a' }, { id: '2', changed: 'b2' }, { id: '3', changed: 'c' }, { id: '4', changed: null }];
  const saved = { 1: { changed: 'a' }, 2: { changed: 'b1' }, 4: { changed: null } };
  assert.deepEqual(needingDetails(list, saved).map((r) => r.id), ['2', '3']);
});
