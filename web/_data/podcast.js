const Parser = require('rss-parser');

async function getPodcastEpisodes() {
  const parser = new Parser();
  const playlistId = 'PLlr-GEyMjkcbnDLipOKqe2p5MT9MKNy3L';
  const feedUrl = `https://www.youtube.com/feeds/videos.xml?playlist_id=${playlistId}`;
  
  try {
    const feed = await parser.parseURL(feedUrl);
    return feed.items.slice(0, 5).map(item => ({
      title: item.title,
      videoId: item.link.split('v=')[1],
      publishedAt: new Date(item.pubDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
      views: item['media:group']?.['media:community']?.[0]?.['media:statistics']?.[0]?.$?.views || null
    }));
  } catch (err) {
    console.error('Podcast RSS fetch error:', err);
    return [];
  }
}

module.exports = getPodcastEpisodes;

