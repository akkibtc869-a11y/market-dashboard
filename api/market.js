const INSTRUMENTS = {
  nifty:     'NSE_INDEX|Nifty 50',
  sensex:    'BSE_INDEX|SENSEX',
  banknifty: 'NSE_INDEX|Nifty Bank',
  vix:       'NSE_INDEX|India VIX',
  niftyit:   'NSE_INDEX|Nifty IT',
  niftyauto: 'NSE_INDEX|Nifty Auto',
  niftypharma: 'NSE_INDEX|Nifty Pharma',
  niftyfmcg: 'NSE_INDEX|Nifty FMCG',
  niftymetal: 'NSE_INDEX|Nifty Metal',
  niftyrealty: 'NSE_INDEX|Nifty Realty',
  niftyenergy: 'NSE_INDEX|Nifty Energy',
  niftyinfra: 'NSE_INDEX|Nifty Infra',
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No access token' });

  try {
    const keys = Object.values(INSTRUMENTS).join(',');
    const quoteRes = await fetch(
      `https://api.upstox.com/v2/market-quote/quotes?instrument_key=${encodeURIComponent(keys)}`,
      { headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' } }
    );
    const quoteData = await quoteRes.json();
    if (!quoteRes.ok) throw new Error(quoteData.message || 'Upstox API error');

    const result = {};
    for (const [name, key] of Object.entries(INSTRUMENTS)) {
      const q = quoteData.data?.[key];
      if (!q) continue;
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

    // Sector mood — based on change %
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

    return res.status(200).json(result);
  } catch (err) {
    console.error('Market error:', err);
    return res.status(500).json({ error: err.message });
  }
}
