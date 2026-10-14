/**
 * Build the CAC marketplace feed from unsold Sanity listings.
 *
 * PREVIEW ONLY for now: it shows what would be sent to CAC (POST /marketplace) and writes it to
 * cac-marketplace-preview.json. Nothing is sent. Sending waits on CAC's answers: which coins they accept
 * (CAC-approved only, or everything), and how a sold coin is taken down (there's no delete call in the docs).
 *
 * Each coin's sellerId is the Sanity listing id, so sending the feed again updates coins instead of duplicating them.
 *
 * Usage:
 *   node cac-marketplace.js            Preview every unsold graded coin.
 *   node cac-marketplace.js --cac-only Preview only CAC-stickered and CACG coins.
 *
 * Env (scripts/engine/.env): none needed for the preview (reads the public dataset).
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createClient } from '@sanity/client';
import slugify from 'slugify';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CAC_ONLY = process.argv.includes('--cac-only');
const SITE = 'https://cabbagecoins.com';
const PROJECT = 'la880an7';
const OUT_FILE = path.join(__dirname, 'cac-marketplace-preview.json');

// CAC's marketplace knows these grading services; Tony's data says "CACG" for CAC's own holders.
const SERVICE = { PCGS: 'PCGS', NGC: 'NGC', CACG: 'CAC' };

// "image-<hash>-1044x1044-jpg" -> the original file on Sanity's CDN (CAC gets the full master, untouched).
const imageUrl = (ref) => {
  const m = /^image-([a-f0-9]+)-(\d+x\d+)-(\w+)$/.exec(ref ?? '');
  return m ? `https://cdn.sanity.io/images/${PROJECT}/production/${m[1]}-${m[2]}.${m[3]}` : null;
};
// "MS66 CAC" -> "MS66", "PR65 CAM CAC" -> "PR65CAM": CAC wants the grade alone, written like its examples.
const gradeOf = (g) => String(g ?? '').replace(/\b(CAC|OGH|CACG)\b/g, '').replace(/\s+/g, ' ').trim()
  .replace(/^([A-Z]+\d+\+?) (?=[A-Z]+$)/, '$1');
const certOf = (n) => String(n ?? '').trim().replace(/_\d+$/, '').replace(/\D/g, '');
// The page's URL, made exactly the way the site's "slug" filter makes it (web/.eleventy.js): keep the two in step.
const pageSlug = (s) => slugify(s.replace('.', '-'), { replacement: '-', remove: /[&,+()$~%.'":*?<>{}]/g, lower: true })
  .replace('dollar', 'usd');

async function main() {
  const client = createClient({ projectId: PROJECT, dataset: 'production', apiVersion: '2024-01-01', useCdn: false });
  const listings = await client.fetch(
    `*[_type == "listing" && sold != true] | order(price desc)
      {_id, name, slug, grade, gradenumber, gradingCompany, cac, price, pcgsCatalogNumber, image, imagesGallery}`,
  );

  const items = [];
  const skipped = [];
  for (const l of listings) {
    const service = SERVICE[l.gradingCompany];
    const why =
      !service ? `grading company "${l.gradingCompany ?? '—'}" isn't one CAC lists` :
      CAC_ONLY && !l.cac && l.gradingCompany !== 'CACG' ? 'not CAC' :
      !l.pcgsCatalogNumber ? 'no PCGS catalog #' :
      !l.price ? 'no price' :
      !l.slug?.current ? 'no slug' :
      !l.image?.asset?._ref ? 'no main photo' : null;
    if (why) { skipped.push({ name: l.name, why }); continue; }

    const photos = [l.image, ...(l.imagesGallery ?? [])]
      .map((i) => imageUrl(i?.asset?._ref)).filter(Boolean)
      .filter((u, i, all) => all.indexOf(u) === i).slice(0, 4);
    items.push({
      sellerId: l._id,
      gradingService: service,
      cert: certOf(l.gradenumber),
      title: l.name,
      pcgsId: String(l.pcgsCatalogNumber),
      grade: gradeOf(l.grade),
      price: l.price,
      quantity: 1,
      listingUrl: `${SITE}/listings/${pageSlug(l.slug.current)}/`,
      imageUrl: photos[0],
      ...(photos[1] && { imageUrl2: photos[1] }),
      ...(photos[2] && { imageUrl3: photos[2] }),
      ...(photos[3] && { imageUrl4: photos[3] }),
    });
  }

  fs.writeFileSync(OUT_FILE, JSON.stringify(items, null, 2));
  console.log(`CAC marketplace PREVIEW${CAC_ONLY ? ' (CAC coins only)' : ''}: ${items.length} coin(s) would be sent. Nothing was sent.\n`);
  for (const i of items) {
    const photos = [i.imageUrl, i.imageUrl2, i.imageUrl3, i.imageUrl4].filter(Boolean).length;
    console.log(`  ${`$${i.price.toLocaleString()}`.padStart(8)}  ${i.gradingService.padEnd(4)} ${i.grade.padEnd(9)} ${i.title}  (${photos} photo${photos === 1 ? '' : 's'})`);
  }
  if (skipped.length) {
    console.log(`\nLeft out (${skipped.length}):`);
    for (const s of skipped) console.log(`  - ${s.name}: ${s.why}`);
  }
  console.log(`\nFull feed: ${OUT_FILE}`);
}

main().catch((err) => {
  console.error(`\n✗ ${err.message}`);
  process.exitCode = 1;
});
