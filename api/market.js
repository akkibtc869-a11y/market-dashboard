const INSTRUMENTS = {
  nifty:       'NSE_INDEX|Nifty 50',
  sensex:      'BSE_INDEX|Sensex',
  banknifty:   'NSE_INDEX|Nifty Bank',
  vix:         'NSE_INDEX|India VIX',
  niftyit:     'NSE_INDEX|Nifty IT',
  niftyauto:   'NSE_INDEX|Nifty Auto',
  niftypharma: 'NSE_INDEX|Nifty Pharma',
  niftyfmcg:   'NSE_INDEX|Nifty FMCG',
  niftymetal:  'NSE_INDEX|Nifty Metal',
  niftyrealty: 'NSE_INDEX|Nifty Realty',
  niftyenergy: 'NSE_INDEX|Nifty Energy',
  niftyinfra:  'NSE_INDEX|Nifty Infra',
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
  if (!token) return res.status(401).json({ error: 'No access token' });

  try {
    // Upstox requires comma-separated instrument keys as a single query param
    const keys = Object.values(INSTRUMENTS).join(',');
    const url = `https://api.upstox.com/v2/market-quote/quotes?instrument_key=${encodeURIComponent(keys)}`;
    
    console.log('Fetching:', url.substring(0, 120));
    
    const quoteRes = await fetch(url, { 
      headers: { 
        'Authorization': `Bearer ${token}`, 
        'Accept': 'application/json' 
      } 
    });
    
    const quoteData = await quoteRes.json();
    console.log('HTTP Status:', quoteRes.status);
    console.log('Response status:', quoteData.status);
    console.log('Data keys available:', JSON.stringify(Object.keys(quoteData.data || {})));

    if (quoteData.status === 'error') throw new Error(JSON.stringify(quoteData.errors));
    if (!quoteRes.ok) throw new Error(`HTTP ${quoteRes.status}`);

    const result = {};
    const availableKeys = Object.keys(quoteData.data || {});
    
    for (const [name, instrKey] of Object.entries(INSTRUMENTS)) {
      const q = quoteData.data?.[instrKey];
      if (!q) { 
        console.log(`No data for [${instrKey}]`); 
        continue; 
      }
      const ltp = q.last_price || 0;
      const prev = q.ohlc?.close || ltp;
      const ch = ltp - prev;
      const pct = prev ? ((ch / prev) * 100) : 0;
      result[name] = {
        val: ltp.toLocaleString('en-IN', { maximumFractionDigits: 2 }),
        ch: (ch >= 0 ? '+' : '') + ch.toFixed(2),
        pct: (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%',
        up: ch >= 0,
        raw: ltp
      };
    }

    console.log('Successfully parsed:', Object.keys(result));

    // Sector mood
    const sectors = ['niftyit','niftyauto','niftypharma','niftyfmcg','niftymetal','niftyrealty','niftyenergy','niftyinfra'];
    let bullCount = 0, bearCount = 0;
    sectors.forEach(s => { if (result[s]) { result[s].up ? bullCount++ : bearCount++; } });
    const total = bullCount + bearCount || 1;
    result.mood = {
      label: bullCount > bearCount ? 'BULLISH' : bearCount > bullCount ? 'BEARISH' : 'NEUTRAL',
      bullPct: Math.round((bullCount / total) * 100),
      bearPct: Math.round((bearCount / total) * 100),
      bullCount, bearCount
    };

    result._availableKeys = availableKeys;
    return res.status(200).json(result);

  } catch (err) {
    console.error('Market error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
