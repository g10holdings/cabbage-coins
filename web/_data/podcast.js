const https = require('https')

const API_KEY = 'AIzaSyCehTOSYjal6lcMESn-uKj5Xrr39fNbDGM'
const PLAYLIST_ID = 'PLlr-GEyMjkcbnDLipOKqe2p5MT9MKNy3L'

function fetchJSON(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = ''
            res.on('data', chunk => data += chunk)
            res.on('end', () => resolve(JSON.parse(data)))
        }).on('error', reject)
    })
}

async function getPodcastEpisodes() {
    try {
        const searchUrl = `https://www.googleapis.com/youtube/v3/playlistItems?key=${API_KEY}&playlistId=${PLAYLIST_ID}&part=snippet&maxResults=10`
        const data = await fetchJSON(searchUrl)

        if (!data.items || data.items.length === 0) {
            console.error('No podcast episodes found')
            return []
        }

        return data.items
            .filter(item => item.snippet.title !== 'Private video' && item.snippet.thumbnails.high)
            .map(item => ({
            title: item.snippet.title,
            videoId: item.snippet.resourceId.videoId,
            publishedAt: new Date(item.snippet.publishedAt).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            }),
            thumbnail: item.snippet.thumbnails.maxres
                ? item.snippet.thumbnails.maxres.url
                : item.snippet.thumbnails.high.url
        }))
    } catch (err) {
        console.error('YouTube API fetch error:', err)
        return []
    }
}

module.exports = getPodcastEpisodes