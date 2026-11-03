const https = require('https')

require('dotenv').config({
    path: `.env.${process.env.NODE_ENV || 'development'}`
})

const API_KEY = process.env.YOUTUBE_API_KEY
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

function fetchText(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = ''
            res.on('data', chunk => data += chunk)
            res.on('end', () => resolve(data))
        }).on('error', reject)
    })
}

// No-key fallback: YouTube's public playlist feed (newest 15 entries). Used when YOUTUBE_API_KEY is
// missing (e.g. a local build) so the homepage podcast preview still has the latest episode.
async function getEpisodesFromFeed() {
    try {
        const xml = await fetchText(`https://www.youtube.com/feeds/videos.xml?playlist_id=${PLAYLIST_ID}`)
        const decode = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        return xml.split('<entry>').slice(1).map((entry) => {
            const pick = (re) => (entry.match(re) || [])[1] || ''
            const videoId = pick(/<yt:videoId>([^<]+)<\/yt:videoId>/)
            return {
                title: decode(pick(/<title>([^<]*)<\/title>/)),
                videoId,
                publishedAt: new Date(pick(/<published>([^<]+)<\/published>/)).toLocaleDateString('en-US', {
                    year: 'numeric', month: 'long', day: 'numeric'
                }),
                thumbnail: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`
            }
        }).filter((e) => e.videoId)
    } catch (err) {
        console.error('YouTube feed fetch error:', err)
        return []
    }
}

async function getPodcastEpisodes() {
    if (!API_KEY) {
        console.warn('YOUTUBE_API_KEY not set - using the public playlist feed for podcast episodes')
        return getEpisodesFromFeed()
    }

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