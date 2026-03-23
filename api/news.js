const FEEDS = [
  { url: 'https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms', name: 'ET Markets', region: 'india' },
  { url: 'https://economictimes.indiatimes.com/news/economy/rssfeeds/50265241.cms', name: 'ET Economy', region: 'india' },
  { url: 'https://economictimes.indiatimes.com/markets/stocks/rssfeeds/2146842.cms', name: 'ET Stocks', region: 'india' },
  { url: 'https://www.moneycontrol.com/rss/MCtopnews.xml', name: 'Moneycontrol', region: 'india' },
  { url: 'https://www.moneycontrol.com/rss/marketreports.xml', name: 'MC Markets', region: 'india' },
  { url: 'https://feeds.reuters.com/reuters/businessNews', name: 'Reuters', region: 'global' },
  { url: 'https://feeds.bbci.co.uk/news/business/rss.xml', name: 'BBC Business', region: 'global' },
];

function parseXML(xml, source, region) {
  const items = [];
  const matches = xml.matchAll(/<item>([\s\S]*?)<\/item>/g);
  for (const m of matches) {
    const block = m[1];
    const title = (block.match(/<title><!\[CDATA\[(.*?)\]\]>|<title>(.*?)<\/title>/s)?.[1] || block.match(/<title>(.*?)<\/title>/s)?.[1] || '').trim();
    const link = (block.match(/<link>(.*?)<\/link>/s)?.[1] || block.match(/<guid[^>]*>(.*?)<\/guid>/s)?.[1] || '#').trim();
    const desc = (block.match(/<description><!\[CDATA\[(.*?)\]\]>|<description>(.*?)<\/description>/s)?.[1] || '').replace(/<[^>]+>/g, '').trim().substring(0, 180);
    const pubDate = (block.match(/<pubDate>(.*?)<\/pubDate>/s)?.[1] || new Date().toISOString()).trim();
    if (title) items.push({ title, link, desc, pubDate, source, region });
  }
  return items;
}

async function fetchFeed(feed) {
  try {
    // Try rss2json first
    const r = await fetch(
      `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feed.url)}&count=25`,
      { signal: AbortSignal.timeout(7000) }
    );
    const d = await r.json();
    if (d.status === 'ok' && d.items?.length > 0) {
      return d.items.map(i => ({
        title: (i.title || '').trim(),
        link: i.link || '#',
        desc: (i.description || '').replace(/<[^>]+>/g, '').trim().substring(0, 180),
        pubDate: i.pubDate || new Date().toISOString(),
        source: feed.name,
        region: feed.region
      }));
    }
  } catch(e) {}

  // Fallback: fetch XML directly via allorigins
  try {
    const r = await fetch(
      `https://api.allorigins.win/raw?url=${encodeURIComponent(feed.url)}`,
      { signal: AbortSignal.timeout(7000) }
    );
    const xml = await r.text();
    return parseXML(xml, feed.name, feed.region);
  } catch(e) {}

  return [];
}

function tagItem(item) {
  const t = (item.title + ' ' + item.desc).toLowerCase();
  if (t.includes('fii') || t.includes('dii') || t.includes('foreign institutional') || t.includes('foreign investor') || t.includes('foreign portfolio'))
    return { tag: 'fii', tagLabel: 'FII/DII' };
  if (t.includes('result') || t.includes('earnings') || t.includes('quarterly') || t.includes('profit') || t.includes('revenue') || t.includes('ipo') || t.includes(' q1 ') || t.includes(' q2 ') || t.includes(' q3 ') || t.includes(' q4 '))
    return { tag: 'result', tagLabel: 'Results' };
  if (item.region === 'global' || t.includes('fed ') || t.includes('federal reserve') || t.includes('us market') || t.includes('china') || t.includes('trump') || t.includes('nasdaq') || t.includes('dow jones') || t.includes('wall street') || t.includes('europe') || t.includes('japan') || t.includes('global market'))
    return { tag: 'global', tagLabel: 'Global' };
  return { tag: 'india', tagLabel: 'India' };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  try {
    const results = await Promise.allSettled(FEEDS.map(fetchFeed));
    const all = results
      .filter(r => r.status === 'fulfilled')
      .flatMap(r => r.value)
      .filter(n => n.title.length > 5)
      .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

    console.log('Total news:', all.length, 'from', FEEDS.length, 'feeds');

    const tagged = all.map(n => ({ ...n, ...tagItem(n) }));
    // Deduplicate by title similarity
    const seen = new Set();
    const deduped = tagged.filter(n => {
      const key = n.title.toLowerCase().substring(0, 40);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const fiiItem = deduped.find(n => n.tag === 'fii');
    return res.status(200).json({
      news: deduped.slice(0, 60),
      fiiHeadline: fiiItem ? { title: fiiItem.title, link: fiiItem.link } : null,
      count: deduped.length
    });
  } catch(err) {
    console.error('News error:', err.message);
    return res.status(500).json({ error: err.message, news: [] });
  }
}
