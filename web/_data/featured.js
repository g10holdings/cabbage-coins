const groq = require('groq')
const client = require('../utils/sanityClient.js')
const overlayDrafts = require('../utils/overlayDrafts')
const hasToken = !!client.config().token

/**
 * Selects the ONE active "Featured" listing for the homepage banner + enhanced
 * listing page.
 *
 * Rules (agreed with Tony):
 *  - A listing is eligible when its `featured` toggle is on AND it is not `sold`.
 *  - If several are eligible at once, the OLDEST listing wins and stays put
 *    (ordered `_createdAt asc`, so index 0). This keeps the pick stable between
 *    builds — a newly-featured coin never hijacks the current one until that one
 *    is sold, unpublished, or toggled off. A build warning lists the extras so
 *    they can be cleaned up in Studio.
 *
 * Returns the single listing object (with `slabFront` / `slabBack` image URLs
 * resolved from the last two gallery photos) or `null` when nothing is featured.
 */
async function getFeatured () {
  // `sold != true`, not `!sold`: in GROQ `!null` is null (not true), so `!sold`
  // silently drops every listing whose Sold toggle was never touched.
  const query = groq`*[_type == "listing" && featured == true && sold != true]{
    _id,
    _createdAt,
    name,
    slug,
    date,
    dateshown,
    denomination,
    category,
    featured,
    sold,
    cac,
    grade,
    gradenumber,
    gradingCompany,
    pcgsCatalogNumber,
    price,
    "galleryImageUrl": imagesGallery[].asset->url,
    "imageUrl": image.asset->url
  } | order(_createdAt asc)`

  let docs = await client.fetch(query).catch(err => { console.error(err); return [] })
  docs = overlayDrafts(hasToken, docs)

  // Re-apply the eligibility filter after draft overlay, in case a draft changes
  // the featured/sold state relative to the published document.
  const active = docs.filter(d => d.featured && !d.sold)

  if (active.length === 0) return null

  if (active.length > 1) {
    const [keep, ...extras] = active
    console.warn(
      `\n⚠  ${active.length} listings are Featured & unsold — the banner shows the oldest: "${keep.name}".` +
      `\n   Toggle Featured off in Studio for: ${extras.map(d => d.name).join(', ')}\n`
    )
  }

  const featured = active[0]
  const gallery = featured.galleryImageUrl || []

  // Slab front/back = the last two gallery photos (photos 3 & 4). Fall back
  // gracefully when a coin has fewer than 4 images so the slide never breaks.
  featured.slabBack = gallery.length >= 1 ? gallery[gallery.length - 1] : null
  featured.slabFront = gallery.length >= 2
    ? gallery[gallery.length - 2]
    : (featured.imageUrl || featured.slabBack || null)

  return featured
}

module.exports = getFeatured
