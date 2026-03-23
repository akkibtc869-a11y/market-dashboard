const RSS_FEEDS = [
  { url: 'https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms', name: 'ET Markets', region: 'india' },
  { url: 'https://economictimes.indiatimes.com/news/economy/rssfeeds/50265241.cms', name: 'ET Economy', region: 'india' },
  { url: 'https://www.moneycontrol.com/rss/MCtopnews.xml', name: 'Moneycontrol', region: 'india' },
  { url: 'https://www.moneycontrol.com/rss/marketreports.xml', name: 'MC Markets', region: 'india' },
  { url: 'https://feeds.reuters.com/reuters/businessNews', name: 'Reuters', region: 'global' },
  { url: 'https://feeds.bbci.co.uk/news/business/rss.xml', name: 'BBC Business', region: 'global' },
  { url: 'https://rss.nytimes.com/services/xml/rss/nyt/Business.xml', name: 'NYT Business', region: 'global' },
];

async function fetchFeed(feed) {
  const apis = [
    `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feed.url)}&count=20`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(feed.url)}`,
  ];
  
  for (const apiUrl of apis) {
    try {
      const res = await fetch(apiUrl, { 
        signal: AbortSignal.timeout(6000),
        headers: { 'Accept': 'application/json, text/xml' }
      });
      
      if (!res.ok) continue;
      const text = await res.text();
      
      // Try JSON parse (rss2json)
      try {
        const json = JSON.parse(text);
        if (json.items?.length) {
          return json.items.map(item => ({
            title: (item.title || '').trim(),
            desc: (item.description || '').replace(/<[^>]+>/g, '').substring(0, 160).trim(),
            link: item.link || '#',
            pubDate: item.pubDate || new Date().toISOString(),
            source: feed.name,
            region: feed.region
          }));
        }
      } catch(e) {}
      
      // Try XML parse
      const items = [];
      const itemMatches = text.matchAll(/<item>([\s\S]*?)<\/item>/g);
      for (const match of itemMatches) {
        const item = match[1];
        const title = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/)?.[1] || item.match(/<title>(.*?)<\/title>/)?.[1] || '';
        const link = item.match(/<link>(.*?)<\/link>|<guid>(.*?)<\/guid>/)?.[1] || '#';
        const desc = item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>|<description>(.*?)<\/description>/)?.[1] || '';
        const pubDate = item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || new Date().toISOString();
        if (title.trim()) {
          items.push({
            title: title.replace(/<[^>]+>/g, '').trim(),
            desc: desc.replace(/<[^>]+>/g, '').substring(0, 160).trim(),
            link: link.trim(),
            pubDate,
            source: feed.name,
            region: feed.region
          });
        }
      }
      if (items.length) return items;
    } catch(e) {
      console.log(`Feed ${feed.name} error:`, e.message);
    }
  }
  return [];
}

function tagNews(n) {
  const t = (n.title + ' ' + n.desc).toLowerCase();
  if (t.includes('fii') || t.includes('dii') || t.includes('foreign institutional') || t.includes('foreign investor')) 
    return { tag: 'fii', tagLabel: 'FII/DII' };
  if (t.includes('result') || t.includes('earnings') || t.includes('quarterly') || t.includes('profit') || t.includes('revenue') || t.includes('ipo') || t.includes('q3') || t.includes('q4') || t.includes('q1') || t.includes('q2')) 
    return { tag: 'result', tagLabel: 'Results' };
  if (n.region === 'global' || t.includes('fed') || t.includes('us market') || t.includes('china') || t.includes('trump') || t.includes('nasdaq') || t.includes('dow jones') || t.includes('wall street') || t.includes('europe') || t.includes('japan') || t.includes('global')) 
    return { tag: 'global', tagLabel: 'Global' };
  return { tag: 'india', tagLabel: 'India' };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  try {
    const results = await Promise.allSettled(RSS_FEEDS.map(fetchFeed));
    const allNews = results
      .filter(r => r.status === 'fulfilled')
      .flatMap(r => r.value)
      .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

    console.log('Total news fetched:', allNews.length);

    const tagged = allNews.map(n => ({ ...n, ...tagNews(n) }));
    const fiiItem = tagged.find(n => n.tag === 'fii');

    return res.status(200).json({
      news: tagged.slice(0, 50),
      fiiDii: fiiItem ? { headline: fiiItem.title, link: fiiItem.link } : null,
      total: tagged.length
    });
  } catch (err) {
    console.error('News error:', err.message);
    return res.status(500).json({ error: err.message, news: [] });
  }
}
