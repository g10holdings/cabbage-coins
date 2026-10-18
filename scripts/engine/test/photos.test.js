// Photo folder and file naming (listing-photos.js) and the folder-name check (photo-folders.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileBase, splitCert, findPhotos, photoFolders } from '../listing-photos.js';
import { compare } from '../photo-folders.js';

test('file names come from the workbook description', () => {
  assert.equal(fileBase('1934-D $1 Peace Silver Dollar PCGS MS65 CAC (Toned)'), '1934-D-1-Dollar-Peace-Silver-Dollar-PCGS-MS65-CAC-Toned');
  assert.equal(fileBase('1895-O $10 Liberty Head Eagle PCGS MS62'), '1895-O-10-Dollar-Liberty-Head-Eagle-PCGS-MS62');
  assert.equal(fileBase('1854 G$1 Princess Head Gold Dollar Type 2 NGC AU55'), '1854-1-Dollar-Gold-Princess-Head-Gold-Dollar-Type-2-NGC-AU55');
  assert.equal(fileBase('1831 25C Capped Bust Quarter PCGS MS64+ (B-4, Small Letters)'), '1831-25C-Capped-Bust-Quarter-PCGS-MS64-Plus-B-4-Small-Letters');
  assert.equal(fileBase('1926 $2.5 Sesquicentennial Gold Commemorative PCGS MS64'), '1926-2.5-Dollar-Sesquicentennial-Gold-Commemorative-PCGS-MS64');
  assert.equal(fileBase('1942/1 10C Mercury Dime CAC VF30 Witterbrick'), '1942-1-10C-Mercury-Dime-CAC-VF30-Witterbrick');
});

test('the cert # is found at the end of a folder name (or the start, the old way)', () => {
  assert.equal(splitCert('1895-O-10-Dollar-Liberty-Head-Eagle-PCGS-MS62-59080489', '59080489'), '1895-O-10-Dollar-Liberty-Head-Eagle-PCGS-MS62');
  assert.equal(splitCert('59080489-1895-O-ten-dollar', '59080489'), '1895-O-ten-dollar');
  assert.equal(splitCert('2020-W-Palladium-Eagle-6042153-049', '6042153-049'), '2020-W-Palladium-Eagle');
  assert.equal(splitCert('Some-Coin-1802592', '02592'), null);   // a cert that's only the tail of another number
  assert.equal(splitCert('Some-Coin-59080489', '5908048'), null);
  assert.equal(splitCert('Some-Coin-59080489', 'N/A'), null);
});

test('photos are found by cert, in the listing\'s slot order', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'photos-test-'));
  try {
    const folder = '1895-O-10-Dollar-MS62-59080489';
    fs.mkdirSync(path.join(root, folder));
    for (const n of [1, 2, 3]) fs.writeFileSync(path.join(root, folder, `1895-O-10-Dollar-MS62-${n}.jpg`), '');
    let found = findPhotos('59080489', photoFolders(root), root);
    assert.equal(found.ready, false);   // -4 missing
    fs.writeFileSync(path.join(root, folder, '1895-O-10-Dollar-MS62-4.jpg'), '');
    found = findPhotos('59080489', photoFolders(root), root);
    assert.equal(found.ready, true);
    // main image = obverse close-up (-2), then reverse close-up, obverse slab, reverse slab
    assert.deepEqual(found.files.map((f) => path.basename(f).slice(-5)), ['2.jpg', '4.jpg', '1.jpg', '3.jpg']);
    assert.equal(findPhotos('12345678', photoFolders(root), root), null);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('folder name check: a wrong year, mint or grade stops; a wrong series word is just noted', () => {
  const peace = { name: '1934-D $1 Peace Silver Dollar PCGS MS65 CAC (Toned)', dateShown: '1934-D', grade: 'MS65 CAC' };
  let [block, notes] = compare('1934-D-Morgan-Silver-Dollar-PCGS-MS65-CAC-Toned', peace);
  assert.deepEqual(block, []);
  assert.match(notes.join(), /Morgan/);
  [block] = compare('1935-D-Peace-Dollar-PCGS-MS65', peace);
  assert.match(block.join(), /year 1935/);
  [block] = compare('1934-S-Peace-Dollar-PCGS-MS65', peace);
  assert.match(block.join(), /mint S/);
  [block] = compare('1934-D-Peace-Dollar-PCGS-MS64', peace);
  assert.match(block.join(), /grade 64/);
  // "1869S" is 1869-S; a grade written without MS/PR is not compared; no mint typed is fine
  [block] = compare('1869S-Liberty-Seated-Half-Dollar-CAC-65-DL-Hansen', { name: '1869-S 50C Liberty Seated Half Dollar CACG MS65', dateShown: '1869-S', grade: 'MS65 CAC' });
  assert.deepEqual(block, []);
  [block] = compare('1913-Ten-Dollar-Indian', { name: '1913-S $10 Indian Head Eagle PCGS MS62', dateShown: '1913-S', grade: 'MS62' });
  assert.deepEqual(block, []);
});
