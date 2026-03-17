const RSS_SOURCES = [
  { url: 'https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms', name: 'ET Markets', region: 'india' },
  { url: 'https://www.moneycontrol.com/rss/MCtopnews.xml', name: 'Moneycontrol', region: 'india' },
  { url: 'https://feeds.reuters.com/reuters/businessNews', name: 'Reuters', region: 'global' },
  { url: 'https://feeds.bbci.co.uk/news/business/rss.xml', name: 'BBC Business', region: 'global' },
];

async function fetchRSS(source) {
  try {
    const res = await fetch(
      `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(source.url)}&count=15`,
      { headers: { 'Accept': 'application/json' } }
    );
    const data = await res.json();
    if (!data.items?.length) return [];
    return data.items.map(item => ({
      title: item.title || '',
      desc: (item.description || '').replace(/<[^>]+>/g, '').substring(0, 150),
      link: item.link || '#',
      pubDate: item.pubDate || new Date().toISOString(),
      source: source.name,
      region: source.region
    }));
  } catch { return []; }
}

async function fetchFiiDii() {
  try {
    const res = await fetch('https://api.rss2json.com/v1/api.json?rss_url=https%3A%2F%2Feconomictimes.indiatimes.com%2Fmarkets%2Fstocks%2Fnews%2Frssfeeds%2F2146842.cms&count=5');
    const data = await res.json();
    // Look for FII/DII news item
    const fiiItem = data.items?.find(i => 
      i.title?.toLowerCase().includes('fii') || i.title?.toLowerCase().includes('foreign')
    );
    if (fiiItem) return { headline: fiiItem.title, link: fiiItem.link };
    return null;
  } catch { return null; }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=300'); // Cache 5 mins

  try {
    const [newsArrays, fiiDii] = await Promise.all([
      Promise.all(RSS_SOURCES.map(fetchRSS)),
      fetchFiiDii()
    ]);

    const allNews = newsArrays.flat().sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

    // Tag each news item
    const tagged = allNews.map(n => {
      const t = (n.title + ' ' + n.desc).toLowerCase();
      let tag = 'india', tagLabel = 'India';
      if (n.region === 'global' || t.includes('fed') || t.includes('us market') || t.includes('china') || t.includes('trump') || t.includes('global') || t.includes('nasdaq')) {
        tag = 'global'; tagLabel = 'Global';
      } else if (t.includes('fii') || t.includes('dii') || t.includes('foreign institutional')) {
        tag = 'fii'; tagLabel = 'FII/DII';
      } else if (t.includes('result') || t.includes('ipo') || t.includes('earnings') || t.includes('quarterly') || t.includes('profit')) {
        tag = 'result'; tagLabel = 'Results';
      }
      return { ...n, tag, tagLabel };
    });

    return res.status(200).json({ news: tagged.slice(0, 40), fiiDii });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
