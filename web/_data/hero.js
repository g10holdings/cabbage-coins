const groq = require('groq')
const client = require('../utils/sanityClient.js')
const overlayDrafts = require('../utils/overlayDrafts')
const hasToken = !!client.config().token

/**
 * The ONE listing Tony picked for the big coin at the top of the homepage (Studio: "Homepage hero").
 * Same rules as featured.js: hero on AND not sold; if several are on, the OLDEST wins and a build
 * warning names the extras. Returns null when none is picked — the homepage then falls back to the
 * priciest coin in stock (the heroCoin filter in .eleventy.js).
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

  if (active.length === 0) return null
  if (active.length > 1) {
    const [keep, ...extras] = active
    console.warn(
      `\n⚠  ${active.length} listings have Homepage hero on — the homepage shows the oldest: "${keep.name}".` +
      `\n   Turn Homepage hero off in Studio for: ${extras.map(d => d.name).join(', ')}\n`
    )
  }
  return active[0]
}

module.exports = getHero
