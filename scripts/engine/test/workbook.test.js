// The workbook's column rules (workbook.js). The fixture is every live listing on 2026-10-18: its workbook row and
// what the site shows. A rule change that breaks any of them fails here.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { listingFromRow, certKey, hasCert, datesOf, pcgsOf, companyOf, categoryOf, gradeOf, denominationOf } from '../workbook.js';

const fixture = JSON.parse(fs.readFileSync(new URL('./live-listings.json', import.meta.url), 'utf8'));
const loose = (s) => String(s ?? '').toUpperCase().replace(/\s+/g, '');

test('the rules reproduce every live listing (2026-10-18)', () => {
  assert.ok(fixture.cases.length > 80);
  for (const { row, expect } of fixture.cases) {
    const w = listingFromRow(row);
    w.pcgsDesignationNumber = w.pcgsPopNumber !== w.pcgsCatalogNumber ? w.pcgsPopNumber : null;   // as the site stores it
    for (const [field, want] of Object.entries(expect)) {
      const got = field === 'grade' ? loose(w.grade) : field === 'date' ? String(w.date) : w[field];
      assert.deepEqual(got, field === 'grade' ? loose(want) : want, `${row.itemDescription}: ${field}`);
    }
  }
});

test('cert numbers: a trailing _2 (back in stock) is dropped; SF_535 and NGC dashes are kept', () => {
  assert.equal(certKey('51354567_2'), '51354567');
  assert.equal(certKey('SF_535'), 'sf_535');
  assert.equal(certKey('6042153-049'), '6042153-049');
  assert.equal(hasCert('N/A'), false);
  assert.equal(hasCert(''), false);
  assert.equal(hasCert('59080489'), true);
});

test('dates: mint mark kept for "date shown", BC dates go negative', () => {
  assert.deepEqual(datesOf('1891-CC $1 Morgan Silver Dollar'), { dateShown: '1891-CC', date: '1891' });
  assert.deepEqual(datesOf('1942/1 10C Mercury Dime'), { dateShown: '1942/1', date: '1942' });
  assert.deepEqual(datesOf('328 BC Alexander the Great Tetradrachm'), { dateShown: '328 BC', date: '-328' });
});

test('PCGS #: "designation/catalog", and a designation # written alone on a DMPL/CAM coin', () => {
  assert.deepEqual(pcgsOf('97199/7199'), { popNumber: 97199, catalogNumber: 7199 });
  assert.deepEqual(pcgsOf('97129', 'MS64DMPL CAC'), { popNumber: 97129, catalogNumber: 7129, guessed: true });
  assert.deepEqual(pcgsOf('83778', 'PR66CAM CAC'), { popNumber: 83778, catalogNumber: 3778, guessed: true });
  assert.deepEqual(pcgsOf('97129', 'MS64'), { popNumber: 97129, catalogNumber: 97129 });
  assert.deepEqual(pcgsOf(0), { popNumber: null, catalogNumber: null });
});

test('grading company and CAC: a CACG holder counts as CAC (as on the site)', () => {
  assert.equal(companyOf('CAC'), 'CACG');
  assert.equal(companyOf('N/A'), 'Ungraded');
  assert.equal(gradeOf('1878-S T$1 Trade Dollar CACG AU50', { company: 'CACG' }), 'AU50 CAC');
  assert.equal(gradeOf('1885 $1 Morgan Silver Dollar CAC MS63 DMPL Witterbrick', { company: 'CACG', cac: 'Y' }), 'MS63 DMPL CAC');
  assert.equal(gradeOf('2026 Best of the Mint 1804(2026) G$1 250 Anniv Privy NGC SP 70', { company: 'NGC' }), 'SP70');
});

test('denomination and category', () => {
  assert.equal(denominationOf('1926 $2.5 Sesquicentennial Gold Commemorative'), '$2.50');
  assert.equal(denominationOf('1804 1/2C Draped Bust Half Cent'), '1/2C');
  assert.equal(categoryOf({ description: '#213 San Francisco Mint Ingot', denomination: '', type: '' }), 'Vintage Ingot');
  assert.equal(categoryOf({ description: '2020-W Palladium Eagle', denomination: 'Pd$25', type: '' }), 'Other');
  assert.equal(categoryOf({ description: '1854 G$1 Princess Head', denomination: 'G$1', type: '' }), 'Gold');
  assert.equal(categoryOf({ description: '1804 1/2C Half Cent', denomination: '1/2C', type: '' }), 'Copper/Bronze');
  assert.equal(categoryOf({ description: '1876-S 50C Seated Half', denomination: '50C', type: '' }), 'Silver');
});

test('Website column: R (ready) and Y (live) are read in any case', () => {
  const row = { inventoryID: 1, itemDescription: '1913-S $10 Indian Head Eagle PCGS MS62', Certification: 'PCGS', CAC: '', 'PCGS Num': 8874, listPrice: 1, Status: 'Active' };
  assert.equal(listingFromRow({ ...row, Website: 'r' }).website, 'R');
  assert.equal(listingFromRow({ ...row, Website: 'Y' }).website, 'Y');
});
