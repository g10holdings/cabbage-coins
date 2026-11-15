// How a slab grade becomes eBay's graded-coin fields (ebay-sync.js): letter grade id + numerical grade.
// eBay ids: 18 = MS/PR, 19 = AU, 20 = EX/XF, 46 = VF, 47 = F, 48 = VG, 49 = G.
import test from 'node:test';
import assert from 'node:assert/strict';
import { gradeParts } from '../ebay-sync.js';

test('US slab grades: the number right after the letter grade', () => {
  assert.deepEqual(gradeParts('MS64'), { letter: '18', num: '64' });
  assert.deepEqual(gradeParts('MS64+'), { letter: '18', num: '64' });
  assert.deepEqual(gradeParts('PR70DCAM'), { letter: '18', num: '70' });
  assert.deepEqual(gradeParts('AU58'), { letter: '19', num: '58' });
  assert.deepEqual(gradeParts('XF45'), { letter: '20', num: '45' });
  assert.deepEqual(gradeParts('VF30'), { letter: '46', num: '30' });
  assert.deepEqual(gradeParts('VG08'), { letter: '48', num: '8' });
  assert.deepEqual(gradeParts('G06'), { letter: '49', num: '6' });
});

test('NGC Ancients grades have no 1-70 number: eBay gets "None", not the strike or surface score', () => {
  assert.deepEqual(gradeParts('MS Star 5/5 4/5'), { letter: '18', num: null });   // not "5" from Strike 5/5
  assert.deepEqual(gradeParts('Ch XF 4/5 3/5'), { letter: '20', num: null });      // "Ch" = Choice, skipped
  assert.deepEqual(gradeParts('Ch AU'), { letter: '19', num: null });
});

test('no grade at all', () => {
  assert.deepEqual(gradeParts(null), { letter: null, num: null });
  assert.deepEqual(gradeParts(''), { letter: null, num: null });
});
