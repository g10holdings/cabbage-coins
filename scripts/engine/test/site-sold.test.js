// The website part of step 4 (site-sold.js): which listings get ticked Sold, and with which sale date.
import test from 'node:test';
import assert from 'node:assert/strict';
import { planSiteSold, planWorkbookCheck } from '../site-sold.js';

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

// The workbook check (Tony, 2026-11-14): live coins must say "Y", and the workbook's listPrice drives the website price.
const wrow = (inventoryID, itemDescription, Status, Website, listPrice) => ({ inventoryID, itemDescription, Status, Website, listPrice });

test('workbook check: live coins not "Y" are listed; a buyback\'s "_2" row is the one that counts', () => {
  const rows = [
    wrow('36671506', '1830 50C Capped Bust Half', 'Sold', 'Y', 2500),
    wrow('36671506_2', '1830 50C Capped Bust Half', 'Active', null, 2700),
    wrow('12345678', '1924-D 25C', 'Active', 'y', 635),          // lower-case y is fine
    wrow('111', '1881-S $1', 'Active', 'R', 300),
  ];
  const check = planWorkbookCheck([
    { _id: 'a', name: '1830 50C Capped Bust Half', gradenumber: '36671506', price: 2700 },
    { _id: 'b', name: '1924-D 25C', gradenumber: '12345678', price: 635 },
    { _id: 'c', name: '1881-S $1', gradenumber: '111', price: 300 },
  ], rows);
  assert.deepEqual(check.notY.map((x) => [x.listing._id, x.inventoryID, x.website]), [['a', '36671506_2', ''], ['c', '111', 'R']]);
  assert.equal(check.price.length, 0);
});

test('workbook check: listPrice sets the website price; a blank listPrice changes nothing', () => {
  const rows = [
    wrow('100', 'Best of the Mint', 'Active', 'Y', 5900),
    wrow('200', 'Justinian I Solidus', 'Active', 'Y', '4000'),     // text in the cell still counts
    wrow('300', 'Same price', 'Active', 'Y', 1250),
    wrow('400', 'No price yet', 'Active', 'Y', null),
  ];
  const check = planWorkbookCheck([
    { _id: 'a', name: 'x', gradenumber: '100', price: 6000 },
    { _id: 'b', name: 'x', gradenumber: '200', price: 4500 },
    { _id: 'c', name: 'x', gradenumber: '300', price: 1250 },
    { _id: 'd', name: 'x', gradenumber: '400', price: 800 },
  ], rows);
  assert.deepEqual(check.price.map((x) => [x.listing._id, x.from, x.to]), [['a', 6000, 5900], ['b', 4500, 4000]]);
  assert.deepEqual(check.noPrice.map((x) => x.listing._id), ['d']);
});

test('workbook check: ingot "535" finds row "SF_535" by its exact name, but never an ambiguous name', () => {
  const name = '9.99 ozs Mint of the United States at San Francisco (Type 2) 999.75 Fine #535';
  const rows = [wrow('SF_535', name, 'Active', 'Y', 19500),
    wrow('A1', 'Twin Ingot', 'Active', 'Y', 100), wrow('A2', 'Twin Ingot', 'Active', 'Y', 120)];
  const check = planWorkbookCheck([
    { _id: 'i', name, gradenumber: '535', price: 19000 },
    { _id: 't', name: 'Twin Ingot', gradenumber: 'N/A', price: 100 },
    { _id: 'z', name: 'Not in the workbook', gradenumber: '999', price: 50 },
  ], rows);
  assert.deepEqual(check.price.map((x) => [x.listing._id, x.inventoryID, x.to]), [['i', 'SF_535', 19500]]);
  assert.deepEqual(check.noRow.map((x) => x.listing._id), ['t', 'z']);
});

test('workbook check skips coins that are sold, being marked sold now, or the stand-in', () => {
  const rows = [wrow('1', 'a', 'Active', null, 10), wrow('2', 'b', 'Active', null, 10), wrow('6042153-049', 'Palladium', 'Sold', 'Y', 1)];
  const check = planWorkbookCheck([
    { _id: 'a', name: 'a', gradenumber: '1', sold: true, price: 5 },
    { _id: 'b', name: 'b', gradenumber: '2', price: 5 },
    { _id: 'p', name: 'Palladium', gradenumber: '6042153-049', price: 5 },
  ], rows, new Set(['b']));
  assert.deepEqual([check.notY, check.noRow, check.price, check.noPrice].map((x) => x.length), [0, 0, 0, 0]);
});
