// The website part of step 4 (site-sold.js): which listings get ticked Sold, and with which sale date.
import test from 'node:test';
import assert from 'node:assert/strict';
import { planSiteSold } from '../site-sold.js';

const row = (inventoryID, itemDescription, Status, sell) => ({ inventoryID, itemDescription, Status, 'Sell Date': sell ? new Date(sell + 'T00:00:00') : null });

test('workbook Sold -> marked sold with its Sell Date; dates filled on already-sold; Studio-only sold left alone', () => {
  const rows = [
    row('59465374', '1885-O $1 Morgan PCGS MS65', 'Sold', '2026-11-11'),
    row('111', '1881-S $1 PCGS MS66', 'Sold', '2026-10-23'),
    row('222', '1900 Lafayette', 'Sold', '2026-12-30'),
    row('333', '1910 10C', 'Active'),
    row('6042153-049', 'Palladium', 'Sold', '2026-10-01'),
  ];
  const plan = planSiteSold([
    { _id: 'a', name: 'x', gradenumber: '59465374', sold: false },
    { _id: 'b', name: 'x', gradenumber: '111', sold: true, soldDate: '2026-10-23' },
    { _id: 'c', name: 'x', gradenumber: '222', sold: true },
    { _id: 'd', name: 'x', gradenumber: '333', sold: true },
    { _id: 'e', name: 'x', gradenumber: '6042153-049', sold: false },
  ], rows, '2026-11-11');
  assert.deepEqual(plan.markSold.map((x) => [x.listing._id, x.soldDate]), [['a', '2026-11-11']]);
  // Layaway (future Sell Date): sold as of today, noted on screen.
  assert.deepEqual(plan.fixDate.map((x) => [x.listing._id, x.soldDate, x.note]), [['c', '2026-11-11', 'layaway (Sell Date in the future)']]);
  // A layaway that later gets its real (later) Sell Date keeps the earlier sale date.
  const later = planSiteSold([{ _id: 'c', name: 'x', gradenumber: '222', sold: true, soldDate: '2026-11-11' }],
    [row('222', '1900 Lafayette', 'Sold', '2026-11-28')], '2026-12-01');
  assert.equal(later.fixDate.length, 0);
  assert.deepEqual(plan.studioOnly.map((x) => [x.listing._id, x.soldDate]), [['d', '2026-11-11']]);
});
