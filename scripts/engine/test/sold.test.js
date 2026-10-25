// Which coins count as sold (sold.js), and matching older photo folders with no cert # (file-photos.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { workbookSales } from '../sold.js';
import { coinKey, folderDenomination, matchByName } from '../file-photos.js';

const row = (inventoryID, itemDescription, Status) => ({ inventoryID, itemDescription, Status });

test('Sold in the workbook counts, by cert; a "_2" row back in stock keeps the cert active', () => {
  const sold = workbookSales([
    row('46341660', '1776-PTS JR 8 Reales Bolivia PCGS MS61', 'Sold'),
    row('202680760', '1881-CC $1 Morgan Silver Dollar CACG MS64DMPL', 'Sold'),
    row('202680760_2', '1881-CC $1 Morgan Silver Dollar CACG MS64DMPL', 'Active'),
    row('6042153-049', '2020-W Burnished Palladium Eagle Pd$25 High Relief NGC MS70', 'Sold'),
    row('5171901', '1881-S $1 Morgan Silver Dollar PCGS MS66 CAC OGH', 'Sold'),
    row('SF_213', '#213 San Francisco Mint Ingot Type 3', 'Sold'),
  ]);
  assert.equal(sold({ gradenumber: '46341660', name: 'anything' }), true);
  assert.equal(sold({ gradenumber: '202680760', name: '' }), false);
  assert.equal(sold({ gradenumber: '6042153-049', name: '' }), false);   // the Palladium stand-in
  // A coin with a cert is never judged by name: this 1881-S has a cert the workbook doesn't know.
  assert.equal(sold({ gradenumber: '99999999', name: '1881-S $1 Morgan Silver Dollar PCGS MS66 CAC OGH' }), false);
  assert.equal(sold({ gradenumber: 'N/A', name: '#213 San Francisco Mint Ingot Type 3' }), true);
});

test('year + mint + grade read the same from old folders, new folders and descriptions', () => {
  assert.equal(coinKey('1881S_1_P66CAC'), '1881S-66');
  assert.equal(coinKey('1881S_1_P66CAC_2'), '1881S-66');
  assert.equal(coinKey('1881-S $1 Morgan Silver Dollar PCGS MS66 CAC'), '1881S-66');
  assert.equal(coinKey('1894-Morgan-Silver-Dollar-PCGS-VF30-CAC'), '1894-30');
  assert.equal(coinKey('1878CC_1_P62DMPLCAC'), '1878CC-62');
  assert.equal(coinKey('1893S-Morgan-Silver-Dollar-PCGS-VG08'), '1893S-8');
  assert.equal(coinKey('1925S_5C_CAC63'), '1925S-63');
  assert.equal(coinKey('2020WPalladium_MS70'), '2020W-70');
  assert.equal(coinKey('2020-Mo Mexico 1 Onza Silver Libertad PCGS MS70'), '2020-70');
  assert.equal(coinKey('1830-Capped-Bust-Half-Dollar-PCGS-AU58'), '1830-58');
  assert.equal(folderDenomination('1891CC_5_P63CAC'), '5');
  assert.equal(folderDenomination('1876_T1_P65_Hansen'), 'T1');
  assert.equal(folderDenomination('1815-over-2-Capped-Bust-Half-Dollar-PCGS-XF40'), null);
});

test('a cert-less folder is filed as sold only when the match is clear', () => {
  const coins = [
    { name: '1891-CC $1 Morgan Silver Dollar PCGS MS63 CAC', sold: false, live: true },
    { name: '1891-CC $5 Liberty Head Half Eagle PCGS MS63+ CAC', sold: true },
    { name: '2026 Best of the Mint 1804 G$1 250 Anniv Privy NGC SP 70', sold: false, live: true },
    { name: '2026 Best of the Mint 1804(2026) Silver Medal Flowing Hair Privy NGC SP 70', sold: true },
    { name: '1916-D 25C Barber Quarter PCGS MS66 CAC', sold: true },
    { name: '1916-D 25C Barber Quarter PCGS MS66 CAC', sold: false, live: true },
    { name: '1909-S/S 1C Lincoln Cent FS-1502 CAC MS65RD', sold: true },
    { name: '1909-S 1C Lincoln Cent PCGS MS65BN CAC', sold: false },
  ];
  assert.equal(matchByName('1891CC_5_P63CAC', coins).sold, true);                 // the $5, not the live Morgan
  assert.equal(matchByName('2026-Silver-Medal-Flowing-Hair-NGC-SP70', coins).sold, true);
  assert.equal(matchByName('1916D-Barber-Quarter-PCGS-MS66-CAC', coins).sold, false);   // tie with a live coin: stays
  assert.ok(matchByName('1909S_1C_P65CAC', coins).ambiguous);                      // tie, neither live: named, stays
  assert.equal(matchByName('1950-Something-MS65', coins), null);
});
