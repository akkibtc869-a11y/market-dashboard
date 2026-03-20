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
    // First fetch all instrument keys from Upstox to verify correct names
    const keys = Object.values(INSTRUMENTS).map(k => encodeURIComponent(k)).join('%2C');
    const url = `https://api.upstox.com/v2/market-quote/quotes?instrument_key=${keys}`;
    
    console.log('Fetching URL:', url.substring(0, 100));
    
    const quoteRes = await fetch(url, { 
      headers: { 
        'Authorization': `Bearer ${token}`, 
        'Accept': 'application/json' 
      } 
    });
    const quoteData = await quoteRes.json();
    console.log('Status:', quoteRes.status);
    console.log('Data keys:', Object.keys(quoteData.data || {}));

    if (!quoteRes.ok) throw new Error(JSON.stringify(quoteData));

    const result = {};
    const dataKeys = Object.keys(quoteData.data || {});
    
    // Map response keys back to our names
    for (const [name, instrKey] of Object.entries(INSTRUMENTS)) {
      // Try exact match first, then case-insensitive
      let q = quoteData.data?.[instrKey];
      if (!q) {
        // Try finding by partial match
        const found = dataKeys.find(k => k.toLowerCase() === instrKey.toLowerCase());
        if (found) q = quoteData.data[found];
      }
      if (!q) { console.log('No data for:', instrKey); continue; }
      
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

    console.log('Parsed result keys:', Object.keys(result));

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

    // Include raw data keys for debugging
    result._availableKeys = dataKeys;

    return res.status(200).json(result);
  } catch (err) {
    console.error('Market error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
