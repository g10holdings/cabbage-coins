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
  const filter = groq`*[_type == "listing"]`
  const projection = groq`{
    _id,
    _createdAt,
    createdAt,
    publishedAt,
    image,
    name,
    slug,
    date,
    dateshown,
    denomination,
    featured,
    sold,
    cac,
    imagesGallery,
    "galleryImageUrl": imagesGallery[].asset->url,
    "imageUrl": image.asset->url,
    grade,
    gradenumber,
    price,
    gradingCompany,
    pcgsCatalogNumber,
    category,
    description[]{
      ...,
      children[]{
        ...,
      }
    },
  }`
  const order = `| order(pcgsCatalogNumber asc)`
  const query = [filter, projection, order].join(' ')
  const docs = await client.fetch(query).catch(err => console.error(err))
const reducedDocs = overlayDrafts(hasToken, docs)
const prepareListings = reducedDocs.map(generateListing)
prepareListings.sort((a, b) => {
  const numA = parseFloat(a.pcgsCatalogNumber) || 999999;
  const numB = parseFloat(b.pcgsCatalogNumber) || 999999;
  return numA - numB;
});
return prepareListings
}

module.exports = getListings