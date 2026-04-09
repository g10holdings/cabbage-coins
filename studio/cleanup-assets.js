// ============================================
// SANITY ASSET CLEANUP SCRIPT
// Run this periodically to remove unused images
// and keep storage under the 5GB free tier limit.
//
// HOW TO GET A TOKEN:
// 1. Go to sanity.io/manage
// 2. Click on the Cabbage Coins project
// 3. Click API → Tokens → Add API token
// 4. Name it anything (e.g. "assetCleanup")
// 5. Select "Editor" permissions
// 6. Copy the token value
//
// HOW TO RUN (read-only mode first to check numbers):
// 1. Comment out the delete block at the bottom
// 2. Run: $env:SANITY_TOKEN="your-token-here"
// 3. Run: node cleanup-assets.js
//
// HOW TO RUN (to actually delete):
// 1. Uncomment the delete block at the bottom
// 2. Run: $env:SANITY_TOKEN="your-token-here"
// 3. Run: node cleanup-assets.js
//
// After running, delete the token from sanity.io/manage
// ============================================
const https = require('https')

const TOKEN = process.env.SANITY_TOKEN 
const PROJECT_ID = 'la880an7'
const DATASET = 'production'
const API_VERSION = 'v2021-06-07'

function sanityFetch(query) {
    return new Promise((resolve, reject) => {
        const encoded = encodeURIComponent(query)
        const options = {
            hostname: `${PROJECT_ID}.api.sanity.io`,
            path: `/${API_VERSION}/data/query/${DATASET}?query=${encoded}`,
            method: 'GET',
            headers: {}
        }
        const req = https.request(options, (res) => {
            let data = ''
            res.on('data', chunk => data += chunk)
            res.on('end', () => resolve(JSON.parse(data)))
        })
        req.on('error', reject)
        req.end()
    })
}

function sanityDelete(assetId) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: `${PROJECT_ID}.api.sanity.io`,
            path: `/${API_VERSION}/data/mutate/${DATASET}`,
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${TOKEN}`,
                'Content-Type': 'application/json'
            }
        }
        const body = JSON.stringify({
            mutations: [{ delete: { id: assetId } }]
        })
        const req = https.request(options, (res) => {
            let data = ''
            res.on('data', chunk => data += chunk)
            res.on('end', () => resolve(JSON.parse(data)))
        })
        req.on('error', reject)
        req.write(body)
        req.end()
    })
}

async function cleanupUnusedAssets() {
    console.log('Fetching all image assets...')
    
    const assetsResult = await sanityFetch(`*[_type == "sanity.imageAsset"]{ _id, url, size }`)
    
    if (!assetsResult.result) {
        console.log('Error:', JSON.stringify(assetsResult))
        return
    }
    
    const allAssets = assetsResult.result
    console.log(`Total assets in library: ${allAssets.length}`)
    console.log(`Total size: ${(allAssets.reduce((sum, a) => sum + (a.size || 0), 0) / 1024 / 1024 / 1024).toFixed(2)} GB`)

    const refsResult = await sanityFetch(`*[_type == "listing"]{ "imageId": image.asset->_id, "galleryIds": imagesGallery[].asset->_id }`)
    const referencedAssets = refsResult.result

    const referencedIds = new Set()
    referencedAssets.forEach(doc => {
        if (doc.imageId) referencedIds.add(doc.imageId)
        if (doc.galleryIds) doc.galleryIds.forEach(id => { if(id) referencedIds.add(id) })
    })

    console.log(`Referenced assets: ${referencedIds.size}`)

    const unreferenced = allAssets.filter(a => !referencedIds.has(a._id))
    const unreferencedSize = unreferenced.reduce((sum, a) => sum + (a.size || 0), 0)
    
    console.log(`Unreferenced assets: ${unreferenced.length}`)
    console.log(`Unreferenced size: ${(unreferencedSize / 1024 / 1024 / 1024).toFixed(2)} GB`)

    /*
    console.log('Starting deletion...')
    let deleted = 0
    for (const asset of unreferenced) {
        await sanityDelete(asset._id)
        deleted++
        if (deleted % 50 === 0) console.log(`Deleted ${deleted} of ${unreferenced.length}...`)
    }
    console.log(`Cleanup complete! Deleted ${deleted} assets.`)
    */
}

cleanupUnusedAssets().catch(console.error)