// eBay-only coins (Website "E"): which rows count, the cert # on look-alike titles, and the main eBay sync
// setting them aside. Invented rows (the repo is public).
import test from 'node:test';
import assert from 'node:assert/strict';
import { ebayOnlyCoins, titleFor } from '../ebay-only.js';
import { ebayOnlyCerts } from '../ebay-sync.js';

const row = (id, website, status = 'Active', extra = {}) => ({
  inventoryID: id, Type: 'US Coins', Type2: 'Clad Commemorative - Modern', itemDescription: '2026 $1 Example Privy NGC MS66',
  Certification: 'NGC', CAC: '', 'PCGS Num': null, Website: website, Status: status, listPrice: 150, ...extra,
});

test('only "E" rows, one per cert; look-alikes get the cert # on the title', () => {
  const { coins } = ebayOnlyCoins([row('1111111-001', 'E'), row('1111111-002', 'e'), row('2222222-001', 'R'), row('3333333-001', 'Y')]);
  assert.deepEqual(coins.map((c) => c.cert), ['1111111-001', '1111111-002']);
  assert.deepEqual(coins.map((c) => c.title), ['2026 $1 Example Privy NGC MS66 #1111111-001', '2026 $1 Example Privy NGC MS66 #1111111-002']);
  assert.equal(coins[0].category, 'Clad');   // not "Silver": no Composition sent to eBay
  assert.equal(coins[0].price, 150);
});

test('a one-of-a-kind name keeps its plain title; sold rows are marked sold', () => {
  const { coins } = ebayOnlyCoins([row('1111111-001', 'E'), row('1111111-002', 'E', 'Sold')]);
  assert.equal(coins[0].title, '2026 $1 Example Privy NGC MS66');
  assert.equal(coins[1].sold, true);
});

test('titles stay within eBay\'s 80 characters, cert # kept whole', () => {
  const t = titleFor('x'.repeat(90), '1234567-001', true);
  assert.equal(t.length, 80);
  assert.ok(t.endsWith(' #1234567-001'));
});

test('ebay-sync sets aside every "E" cert, sold or not', () => {
  const certs = ebayOnlyCerts([row('1111111-001', 'E'), row('1111111-002_2', 'E', 'Sold'), row('2222222-001', 'Y'), row('N/A', 'E')]);
  assert.deepEqual([...certs].sort(), ['1111111-001', '1111111-002']);
});
