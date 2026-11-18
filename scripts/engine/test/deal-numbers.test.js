// Deal numbers (deal-numbers.js): how sales, purchases and money rows are tied to one deal.
import test from 'node:test';
import assert from 'node:assert/strict';
import { toDay, ymd, normId, baseId, certsIn, samePerson, setSamePeople, setDealLinks, proposeDeals } from '../deal-numbers.js';

test('dates from Excel serials and Zoho strings land on the same day', () => {
  assert.equal(toDay(46335), toDay('2026-11-09'));          // Excel serial 46335 = 2026-11-09
  assert.equal(ymd(toDay('2026-11-09')), '2026-11-09');
  assert.equal(toDay(null), null);
});

test('inventory IDs: leading zeros and "#" ignored; a _2 row is the same coin back in stock', () => {
  assert.equal(normId('#01234567'), normId(1234567));
  assert.equal(baseId('8314282_2'), '8314282');
  assert.equal(baseId('4161120-003'), '4161120-003');       // NGC's -003 is part of the cert
});

test('cert numbers are read from Zoho coin lines; "#85 of 230" is not a cert', () => {
  assert.deepEqual(certsIn('1924-D 25C Standing Liberty Quarter PCGS MS64 / #12345678'), ['12345678']);
  assert.deepEqual(certsIn('2024 Flowing Hair Gold w/Privy High Relief #85 of 230 PCGS PR70DCAM / #4161120-003'), ['4161120-003']);
});

test("same person: Tony's same-people list (two first names, one person)", () => {
  setSamePeople([['Richard Vance', 'Monroe Vance']]);
  try {
    assert.ok(samePerson('Richard Vance', 'Monroe Vance'));
    assert.ok(samePerson('Rick Vance', 'Monroe Vance'));                                       // nickname still works
    assert.ok(!samePerson('Richard Vance', 'Andrew Vance'));
  } finally { setSamePeople([]); }
});

test('same person: middle initials, "&" vs "and", an extra LLC', () => {
  assert.ok(samePerson('Brian Fowler', 'Brian J. Fowler'));
  assert.ok(samePerson('Tri-State Gold & Silver', 'Tri-State Gold and Silver LLC'));
  assert.ok(!samePerson('Andrew Pike', 'David Pike'));
  assert.ok(!samePerson('Tony Reyes', ''));
});

test('same person: the ways names are really written in the workbook', () => {
  assert.ok(samePerson('Harbor Rare Coins', 'Harbor Rare Coin'));                       // plural
  assert.ok(samePerson('MVRC', 'Mill Valley Rare Coin'));                                     // initials
  assert.ok(samePerson('Tony Marsh', 'Anthony Marsh'));                                      // nickname
  assert.ok(samePerson('Lakeside Numismatics (Victor Lane)', 'Victor Lane (Lakeside Numis)'));     // the person in ( )
  assert.ok(samePerson('Justin Hale (R&T Coin)', 'Justin Hale (R&T Coins)'));
  assert.ok(samePerson('LibertyBellCoins', 'LibertyBell Coins (Doug Smith)'));             // run together
  assert.ok(samePerson("Baxter's (Dayton Ohio)", "Baxter's (Dayton, OH)"));
  assert.ok(!samePerson('K&K Coins (Rick Moss)', 'R&T Coins (Justin)'));                      // different shops
  assert.ok(!samePerson('Harbor Rare Coins', 'Mill Valley Rare Coin'));                   // "Rare Coin" alone isn't a name
  assert.ok(!samePerson('Richard Vance', 'Monroe Vance'));
});

test('a purchase paid in parts over a few days, and an auction house paid weeks later', () => {
  const d0 = toDay('2026-02-04');
  const purchases = [
    { sheet: 'purchases', row: 2, id: 'W1', day: d0, who: 'Dwight Ames', amount: 8250, medium: 'Check' },
    { sheet: 'purchases', row: 3, id: 'T1', day: toDay('2026-02-24'), who: 'Harbor Rare Coin', amount: 14750, medium: 'Wire' },
  ];
  const out = (row, day, who, amount) => ({ sheet: 'outflows', row, day: toDay(day), who, amount, category: 'Inventory', minor: 'Purchase of Inventory' });
  const outflows = [out(2, '2026-02-04', 'Dwight Ames', 5000), out(3, '2026-02-05', 'Dwight Ames', 1000),
    out(4, '2026-02-06', 'Dwight Ames', 2250), out(5, '2026-04-10', 'Harbor Rare Coins', 14750)];
  const deals = proposeDeals({ sales: [], purchases, inflows: [], outflows, zohoDocs: [] });
  assert.deepEqual(outflows.slice(0, 3).map((r) => r.deal), Array(3).fill(purchases[0].deal));
  assert.match(outflows[0].how, /paid in 3 parts/);
  assert.equal(deals.get(purchases[0].deal).off, 0);
  assert.equal(outflows[3].deal, purchases[1].deal);            // 45 days later, but the exact amount
});

test('a show day: Zoho invoice by cert, a trade-in joins it, a lump check, a paper-slip sale', () => {
  const day = toDay('2026-11-07');
  const sale = (row, id, who, amount, medium = 'Check') => ({ sheet: 'sales', row, id, day, who, amount, collected: amount, medium });
  const sales = [
    sale(2, '01234567', 'Greg Holt', 3400, 'Trade & Check'),
    sale(3, '57000001', 'Greg Holt', 1300, 'Trade & Check'),
    sale(4, '11111111', 'Walk Up Buyer', 500, 'Cash'),
  ];
  const purchases = [
    { sheet: 'purchases', row: 2, id: '22222222', day: day + 1, who: 'Greg Holt', amount: 1000, medium: 'Trade' },
    { sheet: 'purchases', row: 3, id: 'ASE_1001', day, who: 'G10 Solutions', amount: 300, transfer: true },
  ];
  const inflows = [
    { sheet: 'inflows', row: 2, id: '01234567', day, who: 'Greg Holt', amount: 3700, category: 'Sale of Inventory' },
    { sheet: 'inflows', row: 3, id: 'N/A', day, who: 'G10 Solutions LLC', amount: 2000, category: 'Capital Injection' },
  ];
  const zohoDocs = [{ kind: 'invoice', number: 'INV-000165', date: '2026-11-07', customer_name: 'Greg Holt', status: 'paid',
    line_items: [{ description: '1922 G$1 Grant / #01234567', price: 3400 }, { description: '1857-O H10C / #57000001', price: 1300 }] }];

  const deals = proposeDeals({ sales, purchases, inflows, outflows: [], zohoDocs });
  assert.equal(sales[0].deal, 'INV-000165');
  assert.match(sales[0].how, /cert/);
  assert.equal(sales[1].deal, 'INV-000165');
  assert.equal(purchases[0].deal, 'INV-000165');            // the trade-in, a day later, joins the invoice's deal
  assert.match(purchases[0].how, /not on the Zoho record/);
  assert.equal(inflows[0].deal, 'INV-000165');              // the check names one coin but pays the whole deal
  const inv = deals.get('INV-000165');
  assert.equal(inv.off, 0);                                 // (4700 − 1000) − (3700 − 0)
  assert.equal(sales[2].deal, 'D-261107-01');               // paper slip: made-up number
  assert.equal(purchases[1].deal, undefined);               // transfer from G10 Solutions: no deal
  assert.equal(inflows[1].deal, undefined);
  assert.match(inflows[1].how, /not a deal/);
});

test('money out goes to the deal it pays exactly, among same-person deals', () => {
  const d1 = toDay('2026-11-01'), d2 = toDay('2026-11-04');
  const purchases = [
    { sheet: 'purchases', row: 2, id: 'A1', day: d1, who: 'Paul Ricci', amount: 3700, medium: 'Check' },
    { sheet: 'purchases', row: 3, id: 'A2', day: d2, who: 'Paul Ricci', amount: 3250, medium: 'Check' },
  ];
  const outflows = [
    { sheet: 'outflows', row: 9, day: d2, who: 'Paul Ricci', amount: 3700, category: 'Inventory', minor: 'Purchase of Inventory' },
    { sheet: 'outflows', row: 10, day: d2, who: 'Diner', amount: 20, category: 'Bus Expense', minor: 'Meals' },
  ];
  proposeDeals({ sales: [], purchases, inflows: [], outflows, zohoDocs: [] });
  assert.equal(outflows[0].deal, purchases[0].deal);        // nearer in date to the 11-04 deal, but the amount fits 11-01
  assert.equal(outflows[0].how, 'by name + exact amount');
  assert.equal(outflows[1].deal, undefined);
});

test('grading and services invoices: no coins expected, paid when the money-in row matches', () => {
  const inflow = (row, date, who, amount, category) => ({ sheet: 'inflows', row, id: null, day: toDay(date), who, amount, category });
  const inflows = [
    inflow(2, '2026-09-20', 'Kyle Brandt', 180, 'Reimbursement'),
    inflow(3, '2026-01-24', 'Nora Ellis', 925, 'Services Rendered'),
    inflow(4, '2025-08-20', 'Old Friend', 100, 'Reimbursement'),            // before Zoho: stays "not a deal"
  ];
  const zohoDocs = [
    { kind: 'invoice', number: 'INV-000903', date: '2026-09-13', customer_name: 'Kyle Brandt', total: 180,
      line_items: [{ name: 'PCGS Grading Fees (Order# 123)' }, { name: 'Cabbage Coins Handling Fee (10%)' }] },
    { kind: 'invoice', number: 'INV-000904', date: '2026-01-23', customer_name: 'Nora Ellis', total: 925,
      line_items: [{ name: '(1) Year User Access to an exchange' }] },
    { kind: 'invoice', number: 'INV-000905', date: '2026-10-01', customer_name: 'Kyle Brandt', total: 600,
      line_items: [{ name: 'CAC Grading Submission #201' }] },                // not paid in the workbook
  ];
  const deals = proposeDeals({ sales: [], purchases: [], inflows, outflows: [], zohoDocs });
  assert.equal(deals.get('INV-000903').type, 'Grading');
  assert.equal(deals.get('INV-000904').type, 'Services');
  assert.equal(inflows[0].deal, 'INV-000903');
  assert.equal(inflows[1].deal, 'INV-000904');
  assert.equal(deals.get('INV-000903').off, 0);
  assert.equal(deals.get('INV-000905').off, 600);                          // invoiced, no money in yet
  assert.equal(inflows[2].deal, undefined);
  assert.match(inflows[2].how, /not a deal/);
});

test('money back from a seller Tony overpaid joins that purchase', () => {
  const day = toDay('2026-08-20');
  const purchases = [{ sheet: 'purchases', row: 2, id: '33333333', day, who: 'Ned Price', amount: 1000, medium: 'Zelle' }];
  const outflows = [{ sheet: 'outflows', row: 2, day, who: 'Ned Price', amount: 1150, category: 'Inventory' }];
  const inflows = [{ sheet: 'inflows', row: 2, id: null, day: day + 6, who: 'Ned Price', amount: 150, category: 'Sale of Inventory' }];
  const deals = proposeDeals({ sales: [], purchases, inflows, outflows, zohoDocs: [] });
  assert.equal(inflows[0].deal, purchases[0].deal);
  assert.match(inflows[0].how, /refund/);
  assert.equal(deals.get(purchases[0].deal).off, 0);
});

test('a trade with an invoice AND a PO is one deal; a PO minus-line coin is looked up in sales', () => {
  const day = toDay('2026-01-23');
  const sales = [
    { sheet: 'sales', row: 2, id: '4400101-001', day: day + 1, who: 'Lou Carver', amount: 4790, collected: 4790, medium: 'Trade' },
    { sheet: 'sales', row: 3, id: '4400102-002', day: day + 1, who: 'Lou Carver', amount: 6500, collected: 6500, medium: 'Trade' },
  ];
  const purchases = [
    // Tony bought this coin from someone else two weeks earlier: the PO's minus line must NOT land here
    { sheet: 'purchases', row: 2, id: '4400102-002', day: day - 15, who: 'Ann Reed', amount: 5100, medium: 'Check' },
    { sheet: 'purchases', row: 3, id: 'LIB_1001', day: day + 3, who: 'Lou Carver', amount: 11290, medium: 'Trade' },
  ];
  const zohoDocs = [
    { kind: 'estimate', number: 'PO-000901', date: '2026-01-23', customer_name: 'Lou Carver', reference_number: 'Trade and Check',
      line_items: [{ name: 'Silver Libertad Collection', price: 11290 }, { name: '1907 $20 #4400101-001', price: -4790 },
        { name: '1877-CC $20 #4400102-002', price: -6500 }] },
    { kind: 'invoice', number: 'INV-000901', date: '2026-01-24', customer_name: 'Lou Carver', reference_number: 'Trade',
      line_items: [{ name: '1907 $20 #4400101-001', price: 4790 }, { name: '1877-CC $20 #4400102-002', price: 6500 }] },
  ];
  const deals = proposeDeals({ sales, purchases, inflows: [], outflows: [], zohoDocs });
  assert.equal(deals.has('PO-000901'), false);
  assert.deepEqual(deals.get('INV-000901').linked, ['PO-000901']);
  assert.deepEqual([...sales, purchases[1]].map((r) => r.deal), ['INV-000901', 'INV-000901', 'INV-000901']);
  assert.notEqual(purchases[0].deal, 'INV-000901');
  assert.equal(deals.get('INV-000901').off, 0);
});

test("Tony's links list joins an invoice and a PO a week apart", () => {
  const sales = [{ sheet: 'sales', row: 2, id: '90000011', day: toDay('2026-08-15'), who: 'Hal Moss', amount: 13000, collected: 13000, medium: 'Trade' }];
  const purchases = [{ sheet: 'purchases', row: 2, id: '4400103-003', day: toDay('2026-08-22'), who: 'Hal Moss', amount: 13450, medium: 'Cash & Trade' }];
  const outflows = [{ sheet: 'outflows', row: 2, day: toDay('2026-08-24'), who: 'Hal Moss', amount: 450, category: 'Inventory' }];
  const zohoDocs = [
    { kind: 'invoice', number: 'INV-000902', date: '2026-08-15', customer_name: 'Hal Moss', reference_number: 'Trade Credit', line_items: [{ name: 'coin #90000011', price: 13000 }] },
    { kind: 'estimate', number: 'PO-000902', date: '2026-08-22', customer_name: 'Hal Moss', reference_number: 'Trade & Zelle', line_items: [{ name: 'coin #4400103-003', price: 13450 }] },
  ];
  setDealLinks([['INV-000902', 'PO-000902']]);
  try {
    const deals = proposeDeals({ sales, purchases, inflows: [], outflows, zohoDocs });
    assert.equal(deals.has('PO-000902'), false);
    assert.equal(purchases[0].deal, 'INV-000902');
    assert.equal(outflows[0].deal, 'INV-000902');
    assert.equal(deals.get('INV-000902').off, 0);
  } finally { setDealLinks([]); }
});

test('eBay: each payout (or 2-3 in a row) is one deal with the eBay sales it adds up to', () => {
  const sale = (row, date, who, amount) => ({ sheet: 'sales', row, id: String(70000000 + row), day: toDay(date), who, amount, collected: amount, medium: 'eBay Payments' });
  const pay = (row, date, amount) => ({ sheet: 'inflows', row, id: null, day: toDay(date), who: 'eBay', amount, category: 'Sale of Inventory' });
  const sales = [
    sale(2, '2026-03-01', 'Ann Pratt', 300), sale(3, '2026-03-01', 'Ben Ruiz', 125.5),        // one payout, two buyers
    sale(4, '2026-03-08', 'Cal Ortiz', 1000), sale(5, '2026-03-20', 'Dee Fong', 500),        // $2.15 moved to the next payout
    sale(6, '2026-03-25', 'Eve Lund', 400),                                                    // store fee netted
    sale(7, '2026-03-30', 'Fay Nash', 99),                                                     // not paid out yet
  ];
  const inflows = [pay(2, '2026-03-03', 425.5), pay(3, '2026-03-10', 1002.15), pay(4, '2026-03-22', 497.85), pay(5, '2026-03-28', 378.05)];
  const deals = proposeDeals({ sales, purchases: [], inflows, outflows: [], zohoDocs: [] });
  assert.equal(sales[0].deal, 'EB-260303');
  assert.equal(sales[1].deal, 'EB-260303');
  assert.equal(sales[2].deal, 'EB-260322');
  assert.equal(sales[3].deal, 'EB-260322');
  assert.equal(deals.get('EB-260322').off, 0);
  assert.equal(sales[4].deal, 'EB-260328');
  assert.equal(deals.get('EB-260328').off, 21.95);                                             // shows as the fee
  assert.match(sales[5].deal, /^D-/);                                                          // waits with its buyer
});

test('one charge to eBay can pay for coins from two eBay sellers', () => {
  const buy = (row, date, who, amount) => ({ sheet: 'purchases', row, id: String(80000000 + row), day: toDay(date), who, amount, medium: 'Credit Card' });
  const purchases = [buy(2, '2026-01-10', 'eBay', 300), buy(3, '2026-01-14', 'coinseller99', 4800)];
  const outflows = [{ sheet: 'outflows', row: 2, day: toDay('2026-01-10'), who: 'Ebay', amount: 5100, category: 'Inventory', minor: 'Purchase of Inventory' }];
  const deals = proposeDeals({ sales: [], purchases, inflows: [], outflows, zohoDocs: [] });
  assert.equal(purchases[0].deal, purchases[1].deal);
  assert.equal(deals.get(purchases[0].deal).off, 0);
});

test('layaway: payments made before the sale is booked add up to it', () => {
  const sales = [{ sheet: 'sales', row: 2, id: '91000001', day: toDay('2026-09-26'), who: 'Gus Hale', amount: 2100, collected: 2100, medium: 'PayPal FF' }];
  const pay = (row, date, amount) => ({ sheet: 'inflows', row, id: null, day: toDay(date), who: 'Gus Hale', amount, category: 'Sale of Inventory' });
  const inflows = [pay(2, '2026-09-01', 300), pay(3, '2026-09-03', 1000), pay(4, '2026-09-21', 800)];
  const deals = proposeDeals({ sales, purchases: [], inflows, outflows: [], zohoDocs: [] });
  assert.ok(inflows.every((r) => r.deal === sales[0].deal));
  assert.equal(deals.get(sales[0].deal).off, 0);
});

test('a trade split across two spellings of one person is one deal; a coin given as an owner distribution is no deal', () => {
  setSamePeople([['Crestline Coins', 'Hank Moreau']]);
  try {
    const day = toDay('2026-04-24');
    const sales = [{ sheet: 'sales', row: 2, id: '92000001', day, who: 'Hank Moreau', amount: 800, collected: 800, medium: 'Trade' },
      { sheet: 'sales', row: 3, id: '92000002', day, who: 'Tony G', amount: 1500, collected: 1500, medium: 'Capital Distribution' }];
    const purchases = [{ sheet: 'purchases', row: 2, id: '92000003', day, who: 'Crestline Coins', amount: 13500, medium: 'Trade & Check' }];
    proposeDeals({ sales, purchases, inflows: [], outflows: [], zohoDocs: [] });
    assert.equal(sales[0].deal, purchases[0].deal);
    assert.equal(sales[1].deal, undefined);
    assert.match(sales[1].how, /capital distribution/);
  } finally { setSamePeople([]); }
});

test('money in: a reused house number only counts near its own sale; a deal # on the row is used as is', () => {
  const sale = (row, date, id, who, amount) => ({ sheet: 'sales', row, id, day: toDay(date), who, amount, collected: amount, medium: 'Cash' });
  const sales = [sale(2, '2025-04-26', 'AGB_1001', 'Ivo Grant', 6800), sale(3, '2025-10-10', 109, 'Jon Kemp', 425)];
  const pay = (row, date, who, amount, id) => ({ sheet: 'inflows', row, id, day: toDay(date), who, amount, category: 'Sale of Inventory' });
  const inflows = [pay(2, '2025-04-26', 'Ivo Grant', 6800, 109),          // wrong number, typed months before coin 109 sold
    pay(3, '2025-10-10', 'Jon Kemp', 425, 109)];
  const deals = proposeDeals({ sales, purchases: [], inflows, outflows: [], zohoDocs: [] });
  assert.equal(inflows[0].deal, sales[0].deal);
  assert.equal(inflows[1].deal, sales[1].deal);
  assert.equal(deals.get(sales[0].deal).off, 0);
  const inflows2 = [pay(4, '2025-05-02', 'Someone Else', 6800, sales[0].deal)];
  proposeDeals({ sales: sales.map((s) => ({ ...s, deal: undefined })), purchases: [], inflows: inflows2, outflows: [], zohoDocs: [] });
  assert.match(inflows2[0].how, /deal # written/);
});

test('purchases paid with foreign cash on hand (FX Cash) count as paid; the wire covers the rest', () => {
  const buy = (row, amount, medium) => ({ sheet: 'purchases', row, id: String(93000000 + row), day: toDay('2025-12-04'), who: 'Orsini Numismatica', amount, medium });
  const purchases = [buy(2, 140.88, 'FX Cash'), buy(3, 821.8, 'FX Cash'), buy(4, 4085.58, 'Wire'), buy(5, 900, 'Wire')];
  const outflows = [{ sheet: 'outflows', row: 2, day: toDay('2025-12-04'), who: 'Orsini Numismatica', amount: 4985.58, category: 'Inventory', minor: 'Purchase of Inventory' }];
  const deals = proposeDeals({ sales: [], purchases, inflows: [], outflows, zohoDocs: [] });
  assert.equal(outflows[0].deal, purchases[0].deal);
  assert.equal(deals.get(purchases[0].deal).off, 0);
});

test('a third party paying a customer\'s bill joins that customer\'s deal when the comment says "for <customer>"', () => {
  const day = toDay('2025-08-22');
  const sales = [{ sheet: 'sales', row: 2, id: '93000001', day, who: 'Ned Larkin', amount: 4000, collected: 4000, medium: 'Cash & Check' }];
  const inflows = [{ sheet: 'inflows', row: 2, id: '93000001', day, who: 'Ned Larkin', amount: 1000, category: 'Sale of Inventory' },
    { sheet: 'inflows', row: 3, id: null, day, who: 'Ora Pell', amount: 3000, category: 'Sale of Inventory', comment: 'Purchase for Ned Larkin' }];
  const deals = proposeDeals({ sales, purchases: [], inflows, outflows: [], zohoDocs: [] });
  assert.equal(inflows[1].deal, sales[0].deal);
  assert.match(inflows[1].how, /on behalf of Ned Larkin/);
  assert.equal(deals.get(sales[0].deal).off, 0);
});

test('cash a customer stole back during a deal (an outflow to them, Theft/Loss) belongs to that deal', () => {
  const day = toDay('2025-04-26');
  const sales = [{ sheet: 'sales', row: 2, id: 'ZZK_1001', day, who: 'Rory Vance', amount: 1900, collected: 1900, medium: 'Cash' }];
  const inflows = [{ sheet: 'inflows', row: 2, id: 'ZZK_1001', day, who: 'Rory Vance', amount: 3300, category: 'Sale of Inventory' }];
  const outflows = [{ sheet: 'outflows', row: 2, day, who: 'Rory Vance', amount: 1400, category: 'Bus Expense', minor: 'Theft/Loss' }];
  const deals = proposeDeals({ sales, purchases: [], inflows, outflows, zohoDocs: [] });
  assert.equal(outflows[0].deal, sales[0].deal);
  assert.equal(deals.get(sales[0].deal).off, 0);
});
