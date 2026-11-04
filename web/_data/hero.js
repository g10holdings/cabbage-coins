const groq = require('groq')
const client = require('../utils/sanityClient.js')
const overlayDrafts = require('../utils/overlayDrafts')
const hasToken = !!client.config().token

/**
 * Listings Tony switched on in Studio ("Homepage hero"). Each one is ALWAYS in the homepage hero
 * rotation, alongside the priciest coins in stock (the heroPool filter in .eleventy.js).
 * Returns [] when none are on; the rotation then runs on its own.
 */
async function getHero () {
  // `sold != true`, not `!sold` — see featured.js.
  const query = groq`*[_type == "listing" && hero == true && sold != true]{
    _id,
    _createdAt,
    name,
    slug,
    hero,
    sold,
    cac,
    grade,
    gradingCompany,
    price,
    "imageUrl": image.asset->url
  } | order(_createdAt asc)`

  let docs = await client.fetch(query).catch(err => { console.error(err); return [] })
  docs = overlayDrafts(hasToken, docs)
  const active = docs.filter(d => d.hero && !d.sold && d.imageUrl)

  return active
}

module.exports = getHero
