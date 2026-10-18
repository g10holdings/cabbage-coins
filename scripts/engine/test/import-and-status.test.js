// What 2_Import-Listings builds from a workbook row, and the next steps 5_Status-Report gives.
import test from 'node:test';
import assert from 'node:assert/strict';
import { listingFromRow } from '../workbook.js';
import { buildDoc } from '../import-listings.js';
import { nextStep } from '../status-report.js';

const row = (o) => ({ Type: 'US Coins', CAC: '', listPrice: 1000, Website: 'R', Status: 'Active', ...o });

test('a draft listing from a workbook row', () => {
  const used = new Set();
  const trade = buildDoc(listingFromRow(row({ inventoryID: 976979102, itemDescription: '1878-S T$1 Trade Dollar CACG AU50', Certification: 'CACG', CAC: 'Y', 'PCGS Num': 7048 })), used);
  assert.equal(trade._id.startsWith('drafts.'), true);
  assert.equal(trade.gradingCompany, 'CACG');
  assert.equal(trade.cac, true);
  assert.equal(trade.grade, 'AU50 CAC');
  assert.equal(trade.gradenumber, '976979102');
  assert.equal(trade.dateshown, '1878-S');
  assert.equal(trade.pcgsCatalogNumber, 7048);
  assert.equal(trade.pcgsDesignationNumber, undefined);
  assert.equal(trade.sold, false);

  const dpl = buildDoc(listingFromRow(row({ inventoryID: '4492315-004', itemDescription: '1890-CC $1 Morgan Silver Dollar NGC MS61 DPL', Certification: 'NGC', 'PCGS Num': '97199/7199' })), used);
  assert.equal(dpl.pcgsDesignationNumber, 97199);
  assert.equal(dpl.pcgsCatalogNumber, 7199);
  assert.match(dpl.image.alt, /silver dollar/);   // alt text from the design table

  // a series the design table doesn't know gets no alt text (it's never guessed)
  const threeCent = buildDoc(listingFromRow(row({ inventoryID: 21279840, itemDescription: '1882 3CN 3 Cent Proof Nickel PCGS PR66CAM CAC', Certification: 'PCGS', CAC: 'Y', 'PCGS Num': 83778 })), used);
  assert.equal(threeCent.image, undefined);

  // the same name twice gets a different draft id
  const again = buildDoc(listingFromRow(row({ inventoryID: 1, itemDescription: '1878-S T$1 Trade Dollar CACG AU50', Certification: 'CACG', 'PCGS Num': 7048 })), used);
  assert.notEqual(again._id, trade._id);
});

test('next steps in the status report', () => {
  const R = { website: 'R' }, Y = { website: 'Y' };
  assert.match(nextStep({ state: 'ready', w: R, photos: { where: 'inProgress', ready: false } }), /1_Prep-Photos/);
  assert.match(nextStep({ state: 'ready', w: R, photos: { where: 'inProgress', ready: true } }), /2_Import-Listings/);
  assert.match(nextStep({ state: 'draft', w: R, photos: { where: 'inProgress', ready: true }, onListing: 0 }), /2_Import-Listings/);
  assert.match(nextStep({ state: 'draft', w: R, photos: {}, onListing: 4, caption: false }), /3_Choose-Captions/);
  assert.match(nextStep({ state: 'draft', w: R, photos: {}, onListing: 4, caption: true, description: false }), /description/);
  assert.match(nextStep({ state: 'draft', w: R, photos: {}, onListing: 4, caption: true, description: true }), /Publish/);
  const live = { state: 'live', w: Y, photos: { where: 'listed' }, cac: 'on', ebay: 'on', pop: 'yes' };
  assert.equal(nextStep(live), null);
  assert.match(nextStep({ ...live, w: R }), /Website = Y/);
  assert.match(nextStep({ ...live, cac: 'waiting' }), /4_After-Publishing-or-Selling/);
  assert.match(nextStep({ ...live, photos: { where: 'inProgress', ready: true } }), /4_After-Publishing-or-Selling/);
  assert.equal(nextStep({ ...live, ebay: 'kept off', cac: 'n/a' }), null);
  assert.match(nextStep({ state: 'sold', w: Y, photos: { where: 'listed' }, cac: 'off', ebay: 'off' }), /4_After-Publishing-or-Selling/);
  assert.equal(nextStep({ state: 'sold', w: Y, photos: { where: 'sold' }, cac: 'off', ebay: 'off' }), null);
});
