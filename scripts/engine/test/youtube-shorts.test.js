// YouTube Shorts: titles, tags, descriptions and pairing workbook rows with files, listings and videos (youtube-shorts.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { videoTitle, videoTags, videoDescription, listingUrl, planShorts } from '../youtube-shorts.js';

const coin = (inventoryID, itemDescription, extra = {}) => ({
  inventoryID, itemDescription, Type: 'US Coins', Certification: 'PCGS', Video: 'R', ...extra,
});
const ingot = coin('SF_213', '#213 San Francisco Mint Ingot Type 3 Logo 40.95ozs 999.75 FINE',
  { Type: 'Bar/Ingot', Certification: 'N/A', Type2: 'Vintage Ingot' });

test('title: the description without its denomination, then " - cert" (no "_2")', () => {
  assert.equal(videoTitle(coin('45673714_2', '1889-CC $1 Morgan Silver Dollar PCGS XF40')),
    '1889-CC Morgan Silver Dollar PCGS XF40 - 45673714');
  assert.equal(videoTitle(coin('36060490', '1898-S 25C Barber Quarter PCGS MS64 CAC')), '1898-S Barber Quarter PCGS MS64 CAC - 36060490');
  assert.equal(videoTitle(coin('38286678', '1863 1C Indian Head Cent PCGS MS66 CAC (Photo Seal)')),
    '1863 Indian Head Cent PCGS MS66 CAC (Photo Seal) - 38286678');
  assert.equal(videoTitle(coin('2192433-001', '2026 Best of the Mint 1804(2026) G$1 250 Anniv Privy NGC SP 70')),
    '2026 Best of the Mint 1804(2026) 250 Anniv Privy NGC SP 70 - 2192433-001');
  assert.equal(videoTitle(coin('11111111', '1854 1/2C Braided Hair Half Cent PCGS MS64RB')), '1854 Braided Hair Half Cent PCGS MS64RB - 11111111');
  assert.equal(videoTitle(coin('22222222', '1926 $2.5 Indian Head Quarter Eagle PCGS MS63')), '1926 Indian Head Quarter Eagle PCGS MS63 - 22222222');
});

test('ingots keep their own name and get no serial on the end', () => {
  assert.equal(videoTitle(ingot), '#213 San Francisco Mint Ingot Type 3 Logo 40.95ozs 999.75 FINE');
});

test('titles never pass YouTube\'s 100 characters, and keep the cert', () => {
  const t = videoTitle(coin('33333333', `1880-S $1 Morgan Silver Dollar ${'Very Long Pedigree Words '.repeat(6)}PCGS MS65`));
  assert.ok(t.length <= 100);
  assert.ok(t.endsWith(' - 33333333'));
});

test('tags: 5–6, coin first, general ones last', () => {
  assert.deepEqual(videoTags(coin('45673714_2', '1889-CC $1 Morgan Silver Dollar PCGS XF40')),
    ['1889-CC Morgan Silver Dollar', 'Morgan Silver Dollar', 'PCGS', 'Carson City', 'coin collecting', 'Cabbage Coins']);
  assert.deepEqual(videoTags(coin('50925952', '2024 Flowing Hair Gold w/Privy High Relief #85 of 230 PCGS PR70DCAM')).slice(0, 2),
    ['2024 Flowing Hair Gold w/Privy High Relief', 'Flowing Hair Gold w/Privy High Relief']);
  assert.deepEqual(videoTags(ingot), ['San Francisco Mint ingot', 'Vintage Ingot', 'silver ingot', 'bullion', 'coin collecting', 'Cabbage Coins']);
  for (const r of [ingot, coin('1', '1893-CC $5 Liberty Head Half Eagle CAC AU55')]) {
    const n = videoTags(r).length;
    assert.ok(n >= 5 && n <= 6, `${n} tags`);
  }
});

test('the description links the coin\'s own listing page and gives the email', () => {
  const url = listingUrl('1889-cc-usd1-morgan-silver-dollar-pcgs-xf40');
  assert.equal(url, 'https://cabbagecoins.com/listings/1889-cc-usd1-morgan-silver-usd-pcgs-xf40/');
  const d = videoDescription(coin('45673714_2', '1889-CC $1 Morgan Silver Dollar PCGS XF40'), url);
  assert.match(d, /1889-CC Morgan Silver Dollar PCGS XF40/);
  assert.ok(d.includes(url));
  assert.ok(d.includes('tony@cabbagecoins.com'));
});

test('pairing: file by cert, listing by cert (ingot by name), video by file-name title', () => {
  const rows = [
    coin('45673714_2', '1889-CC $1 Morgan Silver Dollar PCGS XF40'),
    ingot,
    coin('44444444', '1901 $1 Morgan Silver Dollar PCGS MS62'),             // file, but not on YouTube yet
    coin('55555555', '1898-S 25C Barber Quarter PCGS MS64 CAC'),            // listing already has a video
    coin('66666666', '1865 $1 Liberty Seated Dollar PCGS XF40', { Video: 'Y' }),
  ];
  const files = ['45673714.MP4', 'SF_213.MP4', '44444444.MP4', '55555555.MP4', '77777777.MP4', 'notes.txt'];
  const listings = [
    { _id: 'a', name: 'x', gradenumber: '45673714', slug: '1889-cc-usd1-morgan', youtubeUrl: null },
    { _id: 'b', name: '#213 San Francisco Mint Ingot Type 3 Logo 40.95ozs 999.75 FINE', gradenumber: 'N/A', slug: '213-sf', youtubeUrl: null },
    { _id: 'c', name: 'x', gradenumber: '44444444', slug: '1901', youtubeUrl: null },
    { _id: 'd', name: 'x', gradenumber: '55555555', slug: '1898-s', youtubeUrl: 'https://youtube.com/shorts/OLDOLDOLD01' },
  ];
  const uploads = [
    { id: 'AAAAAAAAAAA', title: '45673714' },
    { id: 'BBBBBBBBBBB', title: 'SF 213' },   // YouTube Studio turns "_" and "-" in file names into spaces
    { id: 'DDDDDDDDDDD', title: '55555555' },
  ];
  const plan = planShorts(rows, files, listings, uploads);
  assert.deepEqual(plan.todo.map((i) => [i.key, i.video.id, i.listing._id]), [['45673714', 'AAAAAAAAAAA', 'a'], ['sf_213', 'BBBBBBBBBBB', 'b']]);
  const skip = Object.fromEntries(plan.items.filter((i) => i.skip).map((i) => [i.key, i.skip]));
  assert.match(skip['44444444'], /not on YouTube yet/);
  assert.match(skip['55555555'], /already has a video/);
  assert.equal(plan.items.length, 4);                       // the "Y" row isn't looked at
  assert.deepEqual(plan.strayFiles, ['77777777.MP4']);

  // --replace takes the already-linked one too; a re-run after renaming still finds the video by its new title.
  assert.equal(planShorts(rows, files, listings, uploads, { replace: true }).todo.length, 3);
  const renamed = [{ id: 'AAAAAAAAAAA', title: '1889-CC Morgan Silver Dollar PCGS XF40 - 45673714' }];
  assert.equal(planShorts(rows.slice(0, 1), files, listings, renamed).todo[0].video.id, 'AAAAAAAAAAA');
  // ...and once the listing has that very video, it's done.
  const doneListings = [{ ...listings[0], youtubeUrl: 'https://youtube.com/shorts/AAAAAAAAAAA' }];
  assert.match(planShorts(rows.slice(0, 1), files, doneListings, renamed).items[0].skip, /already done/);
});
