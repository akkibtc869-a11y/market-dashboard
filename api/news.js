const RSS_SOURCES = [
  { url: 'https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms', name: 'ET Markets', region: 'india' },
  { url: 'https://www.moneycontrol.com/rss/MCtopnews.xml', name: 'Moneycontrol', region: 'india' },
  { url: 'https://feeds.reuters.com/reuters/businessNews', name: 'Reuters', region: 'global' },
  { url: 'https://feeds.bbci.co.uk/news/business/rss.xml', name: 'BBC Business', region: 'global' },
];

async function fetchRSS(source) {
  try {
    const apiUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(source.url)}&api_key=&count=20`;
    const res = await fetch(apiUrl, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(8000)
    });
    const data = await res.json();
    if (data.status === 'ok' && data.items?.length) {
      return data.items.map(item => ({
        title: (item.title || '').trim(),
        desc: (item.description || '').replace(/<[^>]+>/g, '').substring(0, 150).trim(),
        link: item.link || '#',
        pubDate: item.pubDate || new Date().toISOString(),
        source: source.name,
        region: source.region
      }));
    }
    console.log(`RSS ${source.name} status:`, data.status, data.message);
    return [];
  } catch(e) {
    console.log(`RSS ${source.name} error:`, e.message);
    return [];
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=300');

  try {
    const results = await Promise.allSettled(RSS_SOURCES.map(fetchRSS));
    const allNews = results
      .filter(r => r.status === 'fulfilled')
      .flatMap(r => r.value)
      .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

    console.log('Total news fetched:', allNews.length);

    // Tag each news item
    const tagged = allNews.map(n => {
      const t = (n.title + ' ' + n.desc).toLowerCase();
      let tag = 'india', tagLabel = 'India';
      if (n.region === 'global' || t.includes('fed') || t.includes('us market') || t.includes('china') || t.includes('trump') || t.includes('global') || t.includes('nasdaq') || t.includes('wall street')) {
        tag = 'global'; tagLabel = 'Global';
      } else if (t.includes('fii') || t.includes('dii') || t.includes('foreign institutional')) {
        tag = 'fii'; tagLabel = 'FII/DII';
      } else if (t.includes('result') || t.includes('ipo') || t.includes('earnings') || t.includes('quarterly') || t.includes('profit') || t.includes('q3') || t.includes('q4')) {
        tag = 'result'; tagLabel = 'Results';
      }
      return { ...n, tag, tagLabel };
    });

    // FII/DII headline
    const fiiItem = tagged.find(n => n.tag === 'fii');
    const fiiDii = fiiItem ? { headline: fiiItem.title, link: fiiItem.link } : null;

    // If no news from RSS, return fallback
    if (tagged.length === 0) {
      return res.status(200).json({
        news: getFallback(),
        fiiDii: null,
        source: 'fallback'
      });
    }

    return res.status(200).json({ news: tagged.slice(0, 40), fiiDii });
  } catch (err) {
    console.error('News handler error:', err);
    return res.status(200).json({ news: getFallback(), fiiDii: null });
  }
}

function getFallback() {
  const now = new Date().toISOString();
  return [
    { title: 'Nifty holds above 23,000; banking stocks lead recovery', desc: 'Indian markets show resilience amid global uncertainty with banking sector outperforming.', link: 'https://economictimes.indiatimes.com/markets', pubDate: now, source: 'ET Markets', tag: 'india', tagLabel: 'India' },
    { title: 'FII net sellers for 7th session; DIIs absorb selling pressure', desc: 'Foreign investors continue profit booking while domestic institutions provide support.', link: 'https://economictimes.indiatimes.com/markets', pubDate: now, source: 'ET Markets', tag: 'fii', tagLabel: 'FII/DII' },
    { title: 'Crude oil above $100; India energy stocks in focus', desc: 'Rising crude prices impact import bill and inflation outlook for Indian economy.', link: 'https://economictimes.indiatimes.com/markets', pubDate: now, source: 'ET Markets', tag: 'global', tagLabel: 'Global' },
    { title: 'US Fed holds rates; signals cautious approach ahead', desc: 'Federal Reserve keeps benchmark rates unchanged amid persistent inflation concerns.', link: 'https://economictimes.indiatimes.com/markets', pubDate: now, source: 'Reuters', tag: 'global', tagLabel: 'Global' },
    { title: 'RBI monetary policy: Repo rate decision awaited', desc: 'Market participants watch for RBI guidance on interest rates and liquidity measures.', link: 'https://economictimes.indiatimes.com/markets', pubDate: now, source: 'ET Markets', tag: 'india', tagLabel: 'India' },
  ];
}
