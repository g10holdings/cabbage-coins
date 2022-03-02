const BlocksToMarkdown = require('@sanity/block-content-to-markdown')
const groq = require('groq')
const client = require('../utils/sanityClient.js')
const serializers = require('../utils/serializers')
const overlayDrafts = require('../utils/overlayDrafts')
const hasToken = !!client.config().token

function generateListing (listing) {
  return {
    ...listing,
    description: BlocksToMarkdown(listing.description, { serializers, ...client.config() })
  }
}

async function getListings () {
  // Learn more: https://www.sanity.io/docs/data-store/how-queries-work
  const filter = groq`*[_type == "listing"]`
  const projection = groq`{
    _id,
    publishedAt,
    image,
    name,
    slug,
    date,
    onhold,
    "imageUrl": image.asset->url,
    grade,
    pcgsnumber,
    price,
    description[]{
      ...,
      children[]{
        ...,
      }
    },
  }`
  const order = `| order(publishedAt asc)`
  const query = [filter, projection, order].join(' ')
  const docs = await client.fetch(query).catch(err => console.error(err))
  const reducedDocs = overlayDrafts(hasToken, docs)
  const prepareListings = reducedDocs.map(generateListing)
  return prepareListings
}

module.exports = getListings
