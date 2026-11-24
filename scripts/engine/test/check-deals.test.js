import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkDeals } from '../check-deals.js';
import { toDay } from '../deal-numbers.js';

const sale = (row, date, id, who, amount, fixed = '') => ({ sheet: 'sales', row, fixed, id, day: toDay(date), who, amount, collected: amount, medium: 'Cash' });
const pay = (row, date, who, amount, fixed = '') => ({ sheet: 'inflows', row, fixed, id: null, day: toDay(date), who, amount, category: 'Sale of Inventory' });
const run = (s, today = '2026-11-18') => checkDeals({ sheets: { purchases: [], outflows: [], ...s }, zohoDocs: [], today: toDay(today) });

test('numbers already in the workbook are kept; a balanced deal is not open', () => {
  const res = run({ sales: [sale(2, '2026-11-01', '94000001', 'Ada Quill', 500, 'D-261101-01')], inflows: [pay(2, '2026-11-01', 'Ada Quill', 500, 'D-261101-01')] });
  assert.equal(res.missing.length, 0);
  assert.equal(res.open.length, 0);
  assert.equal(res.deals.get('D-261101-01').off, 0);
});

test('a blank payment row gets the number its deal already has', () => {
  const res = run({ sales: [sale(2, '2026-11-01', '94000001', 'Ada Quill', 500, 'D-261101-03')], inflows: [pay(2, '2026-11-02', 'Ada Quill', 500)] });
  assert.equal(res.missing.length, 1);
  assert.equal(res.missing[0].number, 'D-261101-03');
});

test('a new deal gets the next free D-YYMMDD-NN for its day, skipping numbers in use; one number for all its rows', () => {
  const res = run({
    sales: [sale(2, '2026-11-18', '94000001', 'Ada Quill', 500, 'D-261118-01'), sale(3, '2026-11-18', '94000002', 'Bo Strand', 700)],
    inflows: [pay(2, '2026-11-18', 'Ada Quill', 500, 'D-261118-01'), pay(3, '2026-11-18', 'Bo Strand', 700)],
  });
  assert.deepEqual(res.missing.map((m) => m.number), ['D-261118-02', 'D-261118-02']);
  assert.equal(res.nextToday, 'D-261118-03');
});

test('mistyped numbers are flagged; Zoho\'s 5-digit PO-00001 is fine', () => {
  const res = run({ sales: [sale(2, '2026-11-01', '94000001', 'Ada Quill', 500, 'D-26110-01'), sale(3, '2026-11-01', '94000002', 'Ada Quill', 1, 'D-251101-01'),
    sale(4, '2026-11-01', '94000003', 'Ada Quill', 1, 'PO-00001')], inflows: [] });
  assert.deepEqual(res.odd.map((o) => o.r.row), [2, 3]);
});

test('an unpaid deal is open with what is owed; deals that cancel out for one person are settled', () => {
  const res = run({
    sales: [sale(2, '2026-11-01', '94000001', 'Ada Quill', 500, 'D-261101-01'),
      sale(3, '2026-10-01', '94000002', 'Bo Strand', 300, 'D-261001-01'), sale(4, '2026-10-05', '94000003', 'Bo Strand', 200, 'D-261005-01')],
    inflows: [pay(2, '2026-10-05', 'Bo Strand', 500, 'D-261005-01')],
  });
  assert.deepEqual(res.open.map((d) => [d.id, d.off]), [['D-261101-01', 500]]);
  assert.equal(res.settledAcross, 2);
});

test('new trade practice: sale rows on the INV, trade-in rows on the PO; the two halves balance as a pair', () => {
  const zohoDocs = [
    { kind: 'invoice', number: 'INV-000950', date: '2026-11-20', customer_name: 'Ada Quill', status: 'paid', reference_number: 'Trade & Cash', line_items: [{ name: 'coin #94000001', price: 5000 }] },
    { kind: 'estimate', number: 'PO-000950', date: '2026-11-20', customer_name: 'Ada Quill', status: 'sent', reference_number: 'Trade', line_items: [{ name: 'coin #94000009', price: 3000 }] },
  ];
  const purchase = (row, id, amount, fixed = '') => ({ sheet: 'purchases', row, fixed, id, day: toDay('2026-11-20'), who: 'Ada Quill', amount, medium: 'Trade' });
  const res = checkDeals({ sheets: {
    sales: [sale(2, '2026-11-20', '94000001', 'Ada Quill', 5000, 'INV-000950'), sale(3, '2026-11-20', '94000002', 'Ada Quill', 400)],
    purchases: [purchase(2, '94000009', 3000, 'PO-000950'), purchase(3, '94000010', 250)],
    inflows: [pay(2, '2026-11-20', 'Ada Quill', 2000, 'INV-000950')], outflows: [],
  }, zohoDocs, today: toDay('2026-11-24') });
  assert.deepEqual(res.pairs, [{ inv: 'INV-000950', po: 'PO-000950', from: 'balances', coins: 0 }]);
  assert.equal(res.open.length, 0);
  assert.equal(res.pairBalanced, 2);
  // a blank coin row that ISN'T on either record: its own number, with a hint to check
  const m = res.missing.find((x) => x.r.sheet === 'sales' && x.r.row === 3);
  assert.match(m.number, /^D-261120-/);
  assert.match(m.why, /same person & day as (INV|PO)-000950/);
});
