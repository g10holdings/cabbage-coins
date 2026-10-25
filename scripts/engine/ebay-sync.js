/**
 * Keep Tony's eBay store (cabbage_coins) in step with the website.
 *
 * Every unsold website coin goes on eBay (unless its "Keep off eBay" box is ticked), priced so Tony nets
 * the same as a website sale, with free shipping whose cost is built into the price:
 *   ship cost   under $1,000 → USPS Ground Advantage $6 · $1,000–$4,999 → USPS Priority $20 · $5,000+ → FedEx 2Day $40
 *   package     Ground 4 oz 9×6×1 · Priority 6 oz 9×6×1 · FedEx 8 oz 13×11×2 (Tony buys labels through eBay, which fills
 *               them in from the listing; without these eBay shows 1 oz 1×1×1 and the carrier bills the difference). Ingots: left as set on eBay.
 *   eBay fees   9% of the sale up to $4,000 + 2.35% above + $0.40 per order (store seller, Coins & Paper Money)
 *   eBay price  the smallest whole dollar where price − fees ≥ website price + ship cost
 * No returns, Buy It Now, Good 'Til Cancelled. Offers off unless the coin's "Accept offers on eBay" box is ticked; a filled-in
 * "eBay price (fixed)" replaces the formula price. (Tony's rules, 2026-10-17.)
 *
 * One run:
 *   - coins already on eBay that the script hasn't seen before are ADOPTED (matched by cert #, else exact title):
 *     only price, shipping (incl. package), offers and the return policy are changed on those; Tony's title, photos and description stay.
 *   - new coins are listed (AddFixedPriceItem) with the website photos (slab shots first) + promo card, the title,
 *     and Tony's standard text.
 *   - coins whose price/shipping/package/photo order changed are revised (ReviseFixedPriceItem).
 *   - coins sold or removed on the website are ended on eBay (EndFixedPriceItem).
 *   - coins that SOLD ON EBAY are reported, so Tony can mark them sold on the website.
 *   - eBay listings that match no website coin are reported and left alone.
 * What's on eBay is remembered in Sanity (document "ebay-ledger"), like the CAC marketplace sync.
 *
 * Preview (the default) changes nothing: new listings are checked with eBay's VerifyAddFixedPriceItem,
 * which validates them and quotes the fees without listing anything.
 *
 * Usage:
 *   node ebay-sync.js                    Preview.
 *   node ebay-sync.js --send             Do it.
 *   node ebay-sync.js --ask              Preview, then ask before doing it (4_After-Publishing-or-Selling).
 *   --allow-mass-removal                 Needed with --send when a run would end more than 10 listings (--ask warns and asks).
 *   --relist                             With --send: also list again coins Tony ended on eBay by hand (--ask asks).
 * Sold = Sold in the workbook or the website's Sold box (sold.js). A coin whose eBay listing was ended by hand
 * (not sold on eBay) while it's still for sale on the website is NOT listed again unless Tony says so.
 * Env (engine/.env): SANITY_WRITE_TOKEN, EBAY_APP_ID, EBAY_CERT_ID, EBAY_REFRESH_TOKEN (Extras\Connect-eBay).
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { createClient } from '@sanity/client';
import { certKey, hasCert, nameKey, datesOf, denominationOf } from './workbook.js';
import { slabsFirst } from './photo-order.js';
import { askYes } from './ask.js';
import { settings } from './settings.js';
import { workbookSales } from './sold.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const args = process.argv.slice(2);
let SEND = args.includes('--send');
const ASK = args.includes('--ask');   // preview, then ask before changing anything (4_After-Publishing-or-Selling)
const ALLOW_MASS_REMOVAL = args.includes('--allow-mass-removal');
const RELIST = args.includes('--relist');   // with --send: list again the coins Tony ended on eBay by hand
const MASS_REMOVAL = 10;
const PROJECT = settings.sanity.projectId;
const LEDGER_ID = 'ebay-ledger';
const OUT_FILE = path.join(__dirname, 'ebay-preview.json');

// ---------------------------------------------------------------------------
// Pricing and shipping (Tony's rules)
// ---------------------------------------------------------------------------

export function shippingFor(sitePrice) {
  if (sitePrice >= 5000) return { service: 'FedEx2Day', label: 'FedEx 2Day', cost: 40, oz: 8, size: [13, 11, 2] };
  if (sitePrice >= 1000) return { service: 'USPSPriority', label: 'USPS Priority', cost: 20, oz: 6, size: [9, 6, 1] };
  return { service: 'USPSParcel', label: 'USPS Ground Advantage', cost: 6, oz: 4, size: [9, 6, 1] };
}
// Package as one comparable string, e.g. "4 oz 9x6x1" (what's on eBay vs. what should be).
export const packageKey = (s) => `${s.oz} oz ${s.size.join('x')}`;
// eBay charges its fee on the whole order total, INCLUDING the sales tax it collects from the buyer, so the fee
// is figured on price + tax. 8% covers the combined rate in nearly every state (PA is 6%); Tony, 2026-10-17.
export const SALES_TAX = 0.08;
export const ebayFee = (p) => { const t = p * (1 + SALES_TAX); return 0.09 * Math.min(t, 4000) + 0.0235 * Math.max(t - 4000, 0) + 0.40; };
export function ebayPrice(sitePrice) {
  const want = sitePrice + shippingFor(sitePrice).cost;
  let p = Math.floor(want);   // the price is never below the target: step up to the first whole dollar that nets enough
  while (p - ebayFee(p) < want) p++;
  return p;
}

// ---------------------------------------------------------------------------
// eBay API plumbing
// ---------------------------------------------------------------------------

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const unesc = (s) => String(s ?? '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const tag = (xml, t) => { const m = new RegExp(`<${t}(?: [^>]*)?>([\\s\\S]*?)</${t}>`).exec(xml); return m ? m[1] : ''; };
const tags = (xml, t) => [...xml.matchAll(new RegExp(`<${t}(?: [^>]*)?>([\\s\\S]*?)</${t}>`, 'g'))].map((m) => m[1]);

let token;
async function accessToken() {
  if (token) return token;
  const { EBAY_APP_ID, EBAY_CERT_ID, EBAY_REFRESH_TOKEN } = process.env;
  if (!EBAY_APP_ID || !EBAY_CERT_ID || !EBAY_REFRESH_TOKEN) throw new Error('eBay keys are missing from engine/.env: run Extras\\Connect-eBay first.');
  const res = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: { Authorization: `Basic ${Buffer.from(`${EBAY_APP_ID}:${EBAY_CERT_ID}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: EBAY_REFRESH_TOKEN }),
  });
  const j = await res.json();
  if (!j.access_token) throw new Error(`eBay refused the saved sign-in (${j.error_description ?? j.error}). Run Extras\\Connect-eBay again.`);
  return (token = j.access_token);
}

/** One Trading API call. Returns { ok, xml, errors: [{severity, message}] }. */
async function trading(name, body) {
  const res = await fetch('https://api.ebay.com/ws/api.dll', {
    method: 'POST',
    headers: {
      'X-EBAY-API-CALL-NAME': name, 'X-EBAY-API-SITEID': '0', 'X-EBAY-API-COMPATIBILITY-LEVEL': '1349',
      'X-EBAY-API-IAF-TOKEN': await accessToken(), 'Content-Type': 'text/xml',
    },
    body: `<?xml version="1.0" encoding="utf-8"?><${name}Request xmlns="urn:ebay:apis:eBLBaseComponents">${body}</${name}Request>`,
  });
  const xml = await res.text();
  const errors = tags(xml, 'Errors').map((e) => ({ severity: tag(e, 'SeverityCode'), message: unesc(tag(e, 'LongMessage') || tag(e, 'ShortMessage')) }));
  const ack = tag(xml, 'Ack');
  return { ok: ack === 'Success' || ack === 'Warning', xml, errors };
}

async function rest(url) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${await accessToken()}`, 'Accept-Language': 'en-US' } });
  if (!res.ok) throw new Error(`eBay ${res.status} on ${url.split('?')[0]}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// What's live on eBay
// ---------------------------------------------------------------------------

/** Every ACTIVE listing (the "active" list also returns recently ended ones, so each is checked with GetItem). */
async function liveListings() {
  const ids = [];
  for (let page = 1; ; page++) {
    const r = await trading('GetMyeBaySelling', `<ActiveList><Include>true</Include><Pagination><EntriesPerPage>200</EntriesPerPage><PageNumber>${page}</PageNumber></Pagination></ActiveList>`);
    if (!r.ok) throw new Error(`eBay GetMyeBaySelling: ${r.errors.map((e) => e.message).join('; ')}`);
    const list = tag(r.xml, 'ActiveList');
    ids.push(...tags(list, 'ItemID'));
    if (page >= Number(tag(tag(list, 'PaginationResult'), 'TotalNumberOfPages') || 1)) break;
  }
  const out = [];
  for (const id of [...new Set(ids)]) out.push(await itemInfo(id));
  return out.filter((i) => i.status === 'Active');
}

function packageOf(p) {
  const n = (t) => Number(tag(p, t) || 0);
  return packageKey({ oz: n('WeightMajor') * 16 + n('WeightMinor'), size: [n('PackageLength'), n('PackageWidth'), n('PackageDepth')] });
}

async function itemInfo(id) {
  const r = await trading('GetItem', `<ItemID>${id}</ItemID><DetailLevel>ReturnAll</DetailLevel>`);
  if (!r.ok) return { id, status: 'Unknown', error: r.errors.map((e) => e.message).join('; ') };
  const x = r.xml;
  const certDescriptor = tags(x, 'ConditionDescriptor').find((d) => tag(d, 'Name') === '5');
  return {
    id,
    status: tag(x, 'ListingStatus'),
    title: unesc(tag(x, 'Title')),
    price: Number(tag(tag(x, 'SellingStatus'), 'CurrentPrice')),
    sold: Number(tag(tag(x, 'SellingStatus'), 'QuantitySold') || 0),
    bestOffer: tag(tag(x, 'BestOfferDetails'), 'BestOfferEnabled') === 'true',
    shipService: tag(tag(x, 'ShippingServiceOptions'), 'ShippingService'),
    pkg: packageOf(tag(x, 'ShippingPackageDetails')),
    // "Vendor" = photos the sync sent from the website; eBay reports only the first one's original address.
    // Tony's own uploads (adopted listings) are left alone.
    photoSource: tag(tag(x, 'PictureDetails'), 'PictureSource'),
    firstPhoto: unesc(tag(tag(x, 'PictureDetails'), 'ExternalPictureURL')),
    cert: certDescriptor ? tag(certDescriptor, 'AdditionalInfo') : '',
    url: tag(x, 'ViewItemURL'),
  };
}

// ---------------------------------------------------------------------------
// Building a new listing
// ---------------------------------------------------------------------------

const GRADER = { PCGS: '14', NGC: '15', CACG: '16' };
const LETTER = [[/^(MS|PR|PF|SP)/, '18'], [/^AU/, '19'], [/^(XF|EF)/, '20'], [/^VF/, '46'], [/^F/, '47'], [/^VG/, '48'], [/^G/, '49']];
const MINT = { P: 'Philadelphia', D: 'Denver', S: 'San Francisco', O: 'New Orleans', CC: 'Carson City', W: 'West Point', C: 'Charlotte' };
const COMPOSITION = { Silver: 'Silver', Gold: 'Gold', 'Copper/Bronze': 'Copper', 'Vintage Ingot': 'Silver' };
// Categories decided by rule, before eBay's own suggestion (which put commemoratives in Jefferson nickels and the
// like). Bullion: Tony wants ingots and modern bullion-type coins there, not in US Coins (2026-10-17).
const yearOf = (c) => Number(datesOf(c.name).date) || 0;
const CATEGORY_RULES = [
  { test: (c) => c.category === 'Vintage Ingot', id: '39489', how: 'bullion rule' },                       // Bullion > Silver > Bars & Rounds
  { test: (c) => /palladium/i.test(c.name), id: '34943', how: 'bullion rule' },                             // Bullion > Palladium
  { test: (c) => c.category === 'Gold' && /gold eagle|buffalo|maple|lunar|krugerrand|panda|philharmonic|britannia|kangaroo/i.test(c.name), id: '177652', how: 'bullion rule' }, // Bullion > Gold > Coins
  { test: (c) => /silver eagle|eagle s\$1|\bS\$1\b/i.test(c.name), id: '177653', how: 'bullion rule' },      // Bullion > Silver > Coins
  { test: (c) => /commem/i.test(c.name) && c.category === 'Gold' && yearOf(c) >= 1903 && yearOf(c) <= 1933, id: '179532', how: 'commemorative rule' }, // Commemorative > Gold (1903-1926)
  { test: (c) => /commem|isabella/i.test(c.name) && yearOf(c) >= 1892 && yearOf(c) <= 1954, id: '179531', how: 'commemorative rule' },               // Commemorative > Silver (1892-1954)
  { test: (c) => yearOf(c) >= 1982 && c.category === 'Gold' && /commem|library of congress|best of the mint/i.test(c.name), id: '179534', how: 'commemorative rule' }, // Commemorative > Modern Gold
  { test: (c) => yearOf(c) >= 1982 && /commem|best of the mint/i.test(c.name), id: '179533', how: 'commemorative rule' },                         // Commemorative > Modern Silver/Clad
];
// Tony's wording, word for word (2026-10-17), under a copy of the title.
const STANDARD_TEXT = "I've been selling on eBay for 26 years, since 2000! If you have any questions at all, please don't hesitate to reach out. "
  + 'Bid with confidence and be sure to look at all the pictures in the listing! The item will come securely packaged and shipped promptly!'
  + '<br>Cabbage Coins is a retailer of US and World Coins located in Lancaster PA';
// No returns at all, US or international: eBay shows these as "Final sale" (Tony, 2026-10-17, matching his
// current listings). Used on new listings and set on every revised one.
const RETURN_POLICY = '<ReturnPolicy><ReturnsAcceptedOption>ReturnsNotAccepted</ReturnsAcceptedOption>'
  + '<InternationalReturnsAcceptedOption>ReturnsNotAccepted</InternationalReturnsAcceptedOption></ReturnPolicy>';

// Tony's "Cabbage Coins · follow & message" card (1080×1080): the LAST photo on every listing (Tony, 2026-10-17).
// Served from the website (web/assets/img), like the coin photos come from Sanity: eBay refuses a listing that
// mixes its own hosted pictures with outside ones, so the eBay-hosted copy can't be used.
const PROMO_IMAGE = settings.ebayPromoImage;

const imageUrl = (ref) => {
  const m = /^image-([a-f0-9]+)-(\d+x\d+)-(\w+)$/.exec(ref ?? '');
  return m ? `https://cdn.sanity.io/images/${PROJECT}/${settings.sanity.dataset}/${m[1]}-${m[2]}.${m[3]}` : null;
};

/** The coin's eBay photos: slab shots first, then the close-ups (photo-order.js), then the promo card. */
async function photosFor(coin) {
  const urls = [coin.image, ...(coin.imagesGallery ?? [])].map((i) => imageUrl(i?.asset?._ref)).filter(Boolean)
    .filter((u, i, all) => all.indexOf(u) === i);
  return (await slabsFirst(urls)).slice(0, 11).concat(PROMO_IMAGE);   // eBay allows 12
}
const pictureXml = (photos) => `<PictureDetails>${photos.map((u) => `<PictureURL>${esc(u)}</PictureURL>`).join('')}</PictureDetails>`;

// The whole "Coins & Paper Money" category tree, id -> "Coins: US > Dollars > Morgan (1878-1921)" (loaded once a run).
let treePaths;
async function categoryPaths() {
  if (treePaths) return treePaths;
  const j = await rest('https://api.ebay.com/commerce/taxonomy/v1/category_tree/0/get_category_subtree?category_id=11116');
  treePaths = new Map();
  const walk = (n, trail) => {
    const t = [...trail, n.category.categoryName];
    treePaths.set(n.category.categoryId, { path: t.slice(1).join(' > '), leaf: !n.childCategoryTreeNodes?.length });
    for (const c of n.childCategoryTreeNodes ?? []) walk(c, t);
  };
  walk(j.categorySubtreeNode, []);
  return treePaths;
}

/** The "Coins: US > …" group a US coin's denomination belongs in, so a suggestion can't put a dollar in Large Cents. */
function denominationGroup(coin) {
  const d = denominationOf(coin.name);
  const y = yearOf(coin);
  if (!d || y >= 1934 && /^G\$|^\$(2\.50|3|5|10|20)$/.test(d)) return null;   // modern gold: commemorative/bullion rules
  if (/^G\$|^\$(2\.50|3|5|10|20)$/.test(d)) return 'Gold (Pre-1933)';
  return {
    '1/2C': 'Half Cents', '1C': y && y < 1857 ? 'Large Cents' : 'Small Cents', '2C': 'Two Cents', '3CS': 'Three Cents', '3CN': 'Three Cents',
    H10C: 'Half Dimes', '5C': 'Nickels', '10C': 'Dimes', '20C': 'Twenty Cent Pieces', '25C': 'Quarters', '50C': 'Half Dollars',
    $1: 'Dollars', T$1: 'Dollars',
  }[d] ?? null;
}

async function categoryFor(coin) {
  if (coin.ebayCategoryId) return { id: String(coin.ebayCategoryId), how: 'set in the Studio' };
  const rule = CATEGORY_RULES.find((r) => r.test(coin));
  if (rule) return { id: rule.id, how: rule.how };
  const paths = await categoryPaths();
  const group = /philippines|australia|canada|mexico/i.test(coin.name) ? null : denominationGroup(coin);
  const fits = (id) => paths.get(id)?.leaf && (!group || paths.get(id).path.startsWith(`Coins: US > ${group} > `));
  const q = coin.name.replace(/\b(PCGS|NGC|CACG|CAC|OGH)\b/g, '').replace(/\b(MS|PR|PF|SP|AU|XF|VF|VG|F|G)\d{1,2}\+?\w*/g, '').replace(/\s+/g, ' ').trim();
  const j = await rest(`https://api.ebay.com/commerce/taxonomy/v1/category_tree/0/get_category_suggestions?q=${encodeURIComponent(q)}`);
  const best = (j.categorySuggestions ?? []).map((s) => s.category.categoryId).find(fits);
  if (best) return { id: best, how: 'eBay suggestion' };
  // No suggestion in the right group: the leaf in that group whose years cover the coin (prefer one sharing a series word).
  if (group) {
    const y = yearOf(coin);
    const words = coin.name.toLowerCase().split(/\W+/);
    const leaves = [...paths].filter(([id, p]) => fits(id) && !/mixed lots/i.test(p.path)).map(([id, p]) => {
      const leaf = p.path.split(' > ').pop();
      const [, a, b] = /\((\d{4})-(\d{2,4}|Now)/.exec(leaf) ?? [];
      const to = b === 'Now' ? 9999 : b && b.length === 2 ? Number(a.slice(0, 2) + b) : Number(b);
      return { id, covers: a && y >= Number(a) && y <= to, words: leaf.toLowerCase().split(/\W+/).filter((w) => w.length > 3 && words.includes(w)).length };
    }).filter((l) => l.covers).sort((a, b) => b.words - a.words);
    if (leaves.length === 1 || (leaves.length > 1 && leaves[0].words > leaves[1].words)) return { id: leaves[0].id, how: `by denomination + years` };
  }
  return { id: null, how: group ? `no category under "${group}" fits: set one in the Studio` : 'no suggestion: set one in the Studio' };
}
async function categoryName(id) {
  if (!id) return '—';
  return (await categoryPaths()).get(id)?.path ?? `#${id}`;
}

const conditionCache = new Map();
/** The graded-coin condition fields eBay wants in this category: grader, letter grade, numeric grade, cert #. */
async function conditionXml(categoryId, coin) {
  if (!conditionCache.has(categoryId)) {
    const j = await rest(`https://api.ebay.com/sell/metadata/v1/marketplace/EBAY_US/get_item_condition_policies?filter=categoryIds:{${categoryId}}`).catch(() => null);
    conditionCache.set(categoryId, j?.itemConditionPolicies?.[0] ?? null);
  }
  const policy = conditionCache.get(categoryId);
  const graded = policy?.itemConditions?.find((c) => c.conditionId === '2750');
  if (!graded || !GRADER[coin.gradingCompany]) return '';   // bullion categories / ungraded: no condition
  const grade = String(coin.grade ?? '').replace(/\s/g, '').toUpperCase();
  const num = /^[A-Z]+(\d{1,2})/.exec(grade)?.[1];
  const numDescriptor = graded.conditionDescriptors?.find((d) => d.conditionDescriptorId === '4');
  const numValue = numDescriptor?.conditionDescriptorValues?.find((v) => v.conditionDescriptorValueName === String(Number(num)))?.conditionDescriptorValueId;
  const letter = LETTER.find(([re]) => re.test(grade))?.[1];
  const d = (name, value, extra = '') => `<ConditionDescriptor><Name>${name}</Name>${value ? `<Value>${value}</Value>` : ''}${extra}</ConditionDescriptor>`;
  return `<ConditionID>2750</ConditionID><ConditionDescriptors>${d(1, GRADER[coin.gradingCompany])}${letter ? d(3, letter) : ''}${numValue ? d(4, numValue) : ''}${
    hasCert(coin.gradenumber) ? d(5, '', `<AdditionalInfo>${esc(String(coin.gradenumber).replace(/_\d{1,2}$/, ''))}</AdditionalInfo>`) : ''}</ConditionDescriptors>`;
}

function specifics(coin) {
  const { dateShown, date } = datesOf(coin.name);
  const mint = /-(\w+)$/.exec(dateShown)?.[1];
  const grade = String(coin.grade ?? '').replace(/\s*CAC$/, '');
  const proof = /^(PR|PF|SP)/.test(grade.toUpperCase());
  const s = {
    Certification: coin.gradingCompany === 'CACG' ? 'CAC' : coin.gradingCompany !== 'Ungraded' ? coin.gradingCompany : null,
    Grade: /^([A-Z]+)(\d{1,2}\+?)/.test(grade) ? grade.replace(/^([A-Z]+)(\d{1,2}\+?).*/, '$1 $2') : null,
    Year: date && !date.startsWith('-') ? date : null,
    'Mint Location': MINT[mint] ?? (date && Number(date) < 1980 && coin.category !== 'Vintage Ingot' ? 'Philadelphia' : null),
    Composition: COMPOSITION[coin.category] ?? null,
    Denomination: denominationOf(coin.name) || null,
    'Strike Type': proof ? 'Proof' : 'Business',
    'Circulated/Uncirculated': /^(MS|PR|PF|SP)/.test(grade.toUpperCase()) ? 'Uncirculated' : 'Circulated',
    'Country of Origin': /australia|philippines|canada|mexico|britain/i.test(coin.name) ? null : 'United States',
  };
  return Object.entries(s).filter(([, v]) => v).map(([n, v]) => `<NameValueList><Name>${esc(n)}</Name><Value>${esc(v)}</Value></NameValueList>`).join('');
}

// Ingots weigh more than any standard package: their package is left as Tony set it on eBay.
const ownPackage = (coin) => coin.category === 'Vintage Ingot';
const shippingXml = (coin) => {
  const s = shippingFor(coin.price);
  return `<ShippingDetails><ShippingType>Flat</ShippingType><ShippingServiceOptions><ShippingServicePriority>1</ShippingServicePriority>`
    + `<ShippingService>${s.service}</ShippingService><ShippingServiceCost currencyID="USD">0.0</ShippingServiceCost><FreeShipping>true</FreeShipping>`
    + `</ShippingServiceOptions></ShippingDetails>`
    + (ownPackage(coin) ? '' : `<ShippingPackageDetails><MeasurementUnit>English</MeasurementUnit>`
    + `<PackageLength unit="in">${s.size[0]}</PackageLength><PackageWidth unit="in">${s.size[1]}</PackageWidth><PackageDepth unit="in">${s.size[2]}</PackageDepth>`
    + `<WeightMajor unit="lbs">${Math.floor(s.oz / 16)}</WeightMajor><WeightMinor unit="oz">${s.oz % 16}</WeightMinor></ShippingPackageDetails>`);
};

async function newItemXml(coin) {
  const cat = await categoryFor(coin);
  const photos = await photosFor(coin);
  const description = `<div>${esc(coin.name)}</div><div><br></div><div>${STANDARD_TEXT}</div>`;
  const xml = `<Item><Title>${esc(coin.name.slice(0, 80))}</Title>`
    + `<Description><![CDATA[${description}]]></Description>`
    + `<PrimaryCategory><CategoryID>${cat.id ?? ''}</CategoryID></PrimaryCategory>`
    + `<Storefront><StoreCategoryID>1</StoreCategoryID></Storefront>`
    + `<StartPrice currencyID="USD">${coin.ebayPrice > 0 ? coin.ebayPrice : ebayPrice(coin.price)}</StartPrice><Quantity>1</Quantity>`
    + `<ListingType>FixedPriceItem</ListingType><ListingDuration>GTC</ListingDuration>`
    + `<Country>US</Country><Currency>USD</Currency><Location>Lancaster, Pennsylvania</Location><PostalCode>17602</PostalCode>`
    + `<DispatchTimeMax>2</DispatchTimeMax>`
    + (cat.id ? await conditionXml(cat.id, coin) : '')
    + `<ItemSpecifics>${specifics(coin)}</ItemSpecifics>`
    + pictureXml(photos)
    + RETURN_POLICY
    + shippingXml(coin)
    + `<BestOfferDetails><BestOfferEnabled>${coin.ebayOffers ? 'true' : 'false'}</BestOfferEnabled></BestOfferDetails>`
    + `<InventoryTrackingMethod>ItemID</InventoryTrackingMethod>`
    + `</Item>`;
  return { xml, cat, photos };
}

const feesOf = (xml) => tags(xml, 'Fee').map((f) => ({ name: tag(f, 'Name'), amount: Number(tag(f, 'Fee')) })).filter((f) => f.amount > 0);

// ---------------------------------------------------------------------------
// Ledger (Sanity doc "ebay-ledger"): siteId -> { itemId, price, ship, title, sentAt }
// ---------------------------------------------------------------------------

async function loadLedger(client) {
  const doc = await client.getDocument(LEDGER_ID);
  return doc?.entries ? JSON.parse(doc.entries) : {};
}
async function saveLedger(client, ledger) {
  await client.createOrReplace({
    _id: LEDGER_ID, _type: 'ebayLedger',
    note: 'What scripts/engine/ebay-sync.js has put on eBay. Do not edit by hand.',
    entries: JSON.stringify(ledger),
  });
}

// ---------------------------------------------------------------------------

const money = (n) => `$${Number(n).toLocaleString()}`;

async function main() {
  const { SANITY_WRITE_TOKEN } = process.env;
  if (!SANITY_WRITE_TOKEN) throw new Error('SANITY_WRITE_TOKEN is missing from engine/.env');
  const client = createClient({ projectId: PROJECT, dataset: settings.sanity.dataset, apiVersion: settings.sanity.apiVersion, token: SANITY_WRITE_TOKEN, useCdn: false });

  const [coins, ledger, live] = await Promise.all([
    client.fetch(`*[_type == "listing" && !(_id in path("drafts.**"))]
      {_id, name, sold, price, grade, gradenumber, gradingCompany, category, notOnEbay, ebayOffers, ebayPrice, ebayCategoryId, image, imagesGallery}`),
    loadLedger(client),
    liveListings(),
  ]);
  // Sold = the workbook says Sold, or the website's Sold box (sold.js): a sale marked only in the workbook still ends it here.
  const soldInWorkbook = workbookSales();
  for (const c of coins) if (!c.sold && soldInWorkbook(c)) c.soldInWorkbook = c.sold = true;
  const wanted = coins.filter((c) => !c.sold && !c.notOnEbay && c.price > 0);
  const liveById = new Map(live.map((l) => [l.id, l]));

  // Match eBay listings to coins: the ledger first, then cert #, then exact title.
  const claimed = new Set(Object.values(ledger).map((e) => e.itemId));
  const byCert = new Map(live.filter((l) => l.cert).map((l) => [certKey(l.cert), l]));
  const byTitle = new Map(live.map((l) => [nameKey(l.title), l]));
  const plan = { add: [], adopt: [], revise: [], end: [], soldOnEbay: [], relist: [], unchanged: [], gone: [] };
  for (const c of wanted) {
    const target = { price: c.ebayPrice > 0 ? c.ebayPrice : ebayPrice(c.price), fixed: c.ebayPrice > 0, offers: !!c.ebayOffers, ship: shippingFor(c.price) };
    const e = ledger[c._id];
    if (e) {
      const l = liveById.get(e.itemId);
      // Gone from eBay without selling there: Tony ended it by hand (it sold at a show, say). Never relisted unasked.
      if (!l) { const info = await itemInfo(e.itemId); (info.sold > 0 ? plan.soldOnEbay : plan.relist).push({ coin: c, target, item: info }); continue; }
      if (l.sold > 0) { plan.soldOnEbay.push({ coin: c, item: l }); continue; }
      // Photo order: the ledger remembers the full order sent; before it did (first send), only the first photo is known.
      if (l.photoSource === 'Vendor') target.photos = await photosFor(c);
      const newPhotos = !!target.photos && (e.photos ? e.photos.join(' ') !== target.photos.join(' ') : l.firstPhoto !== target.photos[0]);
      const newPackage = !ownPackage(c) && l.pkg !== packageKey(target.ship);
      if (l.price !== target.price || l.shipService !== target.ship.service || l.bestOffer !== target.offers || newPhotos || newPackage) plan.revise.push({ coin: c, target, item: l, newPhotos, newPackage });
      else plan.unchanged.push({ coin: c, item: l });
      continue;
    }
    const match = (hasCert(c.gradenumber) && byCert.get(certKey(c.gradenumber))) || byTitle.get(nameKey(c.name));
    if (match && !claimed.has(match.id)) { claimed.add(match.id); plan.adopt.push({ coin: c, target, item: match, how: 'cert/title' }); continue; }
    plan.add.push({ coin: c, target });
  }
  // Second pass: eBay titles Tony wrote differently ("…Carson City", "#213 Serial") — same year + grade and most
  // words shared counts as the same coin. Listing it again would make a duplicate.
  const words = (s) => new Set(unesc(s).toLowerCase().replace(/[^a-z0-9$#.+/ ]/g, ' ').split(/\s+/).filter((w) => w.length > 1));
  for (const l of live.filter((x) => !claimed.has(x.id))) {
    const lw = words(l.title);
    let best = null, bestScore = 0;
    for (const p of plan.add) {
      const cw = words(p.coin.name);
      const shared = [...cw].filter((w) => lw.has(w)).length;
      const score = shared / Math.min(cw.size, lw.size);
      const year = datesOf(p.coin.name).date;
      const sameYear = !year || lw.has(year) || [...lw].some((w) => w.startsWith(year));
      if (sameYear && score > bestScore) { best = p; bestScore = score; }
    }
    if (best && bestScore >= 0.6) {
      plan.add.splice(plan.add.indexOf(best), 1);
      claimed.add(l.id);
      plan.adopt.push({ ...best, item: l, how: `similar title (${Math.round(bestScore * 100)}% of words)` });
    }
  }
  const wantedIds = new Set(wanted.map((c) => c._id));
  for (const [siteId, e] of Object.entries(ledger)) {
    if (wantedIds.has(siteId)) continue;
    const l = liveById.get(e.itemId);
    if (!l) { plan.gone.push(siteId); continue; }   // already gone from eBay: just forget it (on the next send)
    const coin = coins.find((c) => c._id === siteId) ?? { _id: siteId, name: e.title };
    (l.sold > 0 ? plan.soldOnEbay : plan.end).push({ coin, item: l, why: coin.soldInWorkbook ? 'Sold in the workbook' : coin.sold ? 'sold on the website' : coin.notOnEbay ? '"Keep off eBay" ticked' : 'no longer on the website' });
  }
  const unmatched = live.filter((l) => !claimed.has(l.id));

  // Preview: let eBay validate each new listing (lists nothing).
  for (const p of [...plan.add, ...plan.relist]) {
    const built = await newItemXml(p.coin);
    p.cat = built.cat; p.catName = await categoryName(built.cat.id); p.photos = built.photos; p.xml = built.xml;
    if (!SEND) {
      const v = await trading('VerifyAddFixedPriceItem', built.xml);
      p.verify = { ok: v.ok, errors: v.errors.filter((e) => e.severity === 'Error').map((e) => e.message), warnings: v.errors.filter((e) => e.severity === 'Warning').map((e) => e.message), fees: feesOf(v.xml) };
    }
  }

  // Report.
  const line = (p) => `${money(p.coin.price).padStart(8)} site → ${money(p.target.price).padStart(8)} eBay${p.target.fixed ? ' (your fixed price)' : ''}, ${p.target.ship.label}${p.target.offers ? ', offers ON' : ''}  ${p.coin.name}`;
  console.log(`eBay sync: ${SEND ? 'SENDING' : 'PREVIEW, nothing is changed'}\n`);
  console.log(`  Live on eBay now: ${live.length}   Website coins for eBay: ${wanted.length}\n`);
  console.log(`+ New listings: ${plan.add.length}`);
  for (const p of plan.add) {
    console.log(`  ${line(p)}`);
    console.log(`        category: ${p.catName} (${p.cat.how})  ·  ${p.photos.length} photos`);
    if (p.verify) {
      if (p.verify.errors.length) console.log(`        ✗ eBay would refuse it: ${p.verify.errors.join(' | ')}`);
      else console.log(`        ✓ eBay accepts it${p.verify.fees.length ? ` (listing fees: ${p.verify.fees.map((f) => `${f.name} $${f.amount}`).join(', ')})` : ', no listing fee'}`);
      for (const w of p.verify.warnings) console.log(`        ⚠ ${w}`);
    }
  }
  console.log(`\n⇄ Already on eBay, taken over by the sync (price, shipping, offers, returns set; your title, photos, description kept): ${plan.adopt.length}`);
  for (const p of plan.adopt) console.log(`  ${line(p)}   (now ${money(p.item.price)}${p.item.bestOffer ? ', offers on' : ''}${p.how !== 'cert/title' ? `; matched by ${p.how}: eBay title "${p.item.title}"` : ''})`);
  console.log(`\n~ Price, shipping, package or photo order to update: ${plan.revise.length}`);
  for (const p of plan.revise) console.log(`  ${line(p)}   (now ${money(p.item.price)})${p.item.bestOffer !== p.target.offers ? `  · offers: ${p.item.bestOffer ? 'on → off' : 'off → on'}` : ''}${p.newPhotos ? '  · photos: slabs first' : ''}${p.newPackage ? `  · package: ${p.item.pkg} → ${packageKey(p.target.ship)}` : ''}`);
  console.log(`\n− To end on eBay: ${plan.end.length}`);
  for (const p of plan.end) console.log(`  ${p.coin.name}  (${p.why})`);
  if (plan.soldOnEbay.length) {
    console.log(`\n$ SOLD ON EBAY — mark these sold on the website: ${plan.soldOnEbay.length}`);
    for (const p of plan.soldOnEbay) console.log(`  ${p.coin.name}`);
  }
  if (plan.relist.length) {
    console.log(`\n! Ended on eBay by hand, but still for sale on the website: ${plan.relist.length}`);
    for (const p of plan.relist) console.log(`  ${line(p)}`);
    console.log('  If it sold, mark it Sold in the workbook and it drops off this list. If not, you\'ll be asked below whether to list it again.');
  }
  if (unmatched.length) {
    console.log(`\n? On eBay but not matched to a website coin (left alone): ${unmatched.length}`);
    for (const l of unmatched) console.log(`  ${money(l.price)}  ${l.title}`);
  }
  console.log(`\n= Unchanged: ${plan.unchanged.length}`);
  fs.writeFileSync(OUT_FILE, JSON.stringify({ ...plan, add: plan.add.map(({ xml, ...p }) => p) }, null, 2));

  // Many endings at once could mean a bad read rather than a busy week: asked about plainly, never done unasked.
  const mass = plan.end.length > MASS_REMOVAL && !ALLOW_MASS_REMOVAL;
  if (mass && !ASK) throw new Error(`This would end ${plan.end.length} listings at once. If that's right, run again with --allow-mass-removal.`);
  if (mass) console.log(`\n⚠ That's ${plan.end.length} eBay listings ending at once, more than usual. Check the − list above: are they all right?`);
  if (plan.gone.length) console.log(`\n(${plan.gone.length} coin(s) already sold or ended on eBay: the sync's record of them is cleared on the next send.)`);
  const work = [plan.add.length && `list ${plan.add.length}`, plan.adopt.length && `take over ${plan.adopt.length}`, plan.revise.length && `update ${plan.revise.length}`,
    plan.end.length && `end ${plan.end.length}`, plan.gone.length && `clear ${plan.gone.length} old record(s)`].filter(Boolean);
  if (!SEND) {
    if (ASK && work.length && await askYes(`\neBay: ${work.join(', ')}${mass ? ' (all those endings are right)' : ''}. Go ahead? (y/N) `)) SEND = true;
    else if (!(ASK && plan.relist.length)) { console.log(work.length ? '\nNothing was changed on eBay.' : '\nNothing to change on eBay.'); return; }
    else { if (work.length) console.log('\nNone of that will be changed on eBay.'); for (const k of ['add', 'adopt', 'revise', 'end', 'gone']) plan[k] = []; }
  }
  // Coins Tony ended on eBay himself go back up only when he says so: one question for the lot, default no.
  if (plan.relist.length && (RELIST || (ASK && await askYes(`\neBay: list the ${plan.relist.length} coin(s) you ended by hand again? (y/N) `)))) plan.add.push(...plan.relist);
  else if (plan.relist.length) console.log(`\n(${plan.relist.length} coin(s) ended by hand stay off eBay.)`);
  if (![plan.add, plan.adopt, plan.revise, plan.end, plan.gone].some((x) => x.length)) { console.log('\nNothing was changed on eBay.'); return; }

  // Send.
  const now = new Date().toISOString();
  const failed = [];
  const reviseXml = (itemId, p) => `<Item><ItemID>${itemId}</ItemID><StartPrice currencyID="USD">${p.target.price}</StartPrice>`
    + `${shippingXml(p.coin)}<BestOfferDetails><BestOfferEnabled>${p.target.offers}</BestOfferEnabled></BestOfferDetails>`
    + (p.newPhotos ? pictureXml(p.target.photos) : '')
    + RETURN_POLICY + '</Item>';
  for (const p of [...plan.adopt, ...plan.revise]) {
    const r = await trading('ReviseFixedPriceItem', reviseXml(p.item.id, p));
    if (r.ok) {
      const photos = p.newPhotos ? p.target.photos : ledger[p.coin._id]?.photos;
      ledger[p.coin._id] = { itemId: p.item.id, price: p.target.price, ship: p.target.ship.service, title: p.coin.name, sentAt: now, ...(photos && { photos }) };
    } else failed.push(`${p.coin.name}: ${r.errors.map((e) => e.message).join('; ')}`);
  }
  for (const p of plan.add) {
    const r = await trading('AddFixedPriceItem', p.xml);
    if (r.ok) ledger[p.coin._id] = { itemId: tag(r.xml, 'ItemID'), price: p.target.price, ship: p.target.ship.service, title: p.coin.name, sentAt: now, photos: p.photos };
    else failed.push(`${p.coin.name}: ${r.errors.filter((e) => e.severity === 'Error').map((e) => e.message).join('; ')}`);
  }
  for (const p of plan.end) {
    const r = await trading('EndFixedPriceItem', `<ItemID>${p.item.id}</ItemID><EndingReason>NotAvailable</EndingReason>`);
    if (r.ok || /already been closed/i.test(r.errors.map((e) => e.message).join(' '))) delete ledger[p.coin._id];
    else failed.push(`${p.coin.name}: ${r.errors.map((e) => e.message).join('; ')}`);
  }
  for (const siteId of plan.gone) delete ledger[siteId];   // sold or ended on eBay already; the record was stale
  await saveLedger(client, ledger);
  console.log(`\nDone: ${plan.add.length + plan.adopt.length + plan.revise.length + plan.end.length - failed.length} change(s) made.`);
  if (failed.length) { console.log(`✗ ${failed.length} failed (they'll be tried again next run):`); for (const f of failed) console.log(`  ${f}`); }
}

main().catch((err) => {
  console.error(`\n✗ ${err.message}`);
  process.exitCode = 1;
});
