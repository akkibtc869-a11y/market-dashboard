const INSTRUMENTS = {
  nifty:       'NSE_INDEX|Nifty 50',
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
  sensex:      'BSE_INDEX|SENSEX',
  usdinr:      'NSE_INDEX|Nifty 50', // fallback, USD/INR from separate source
};

const RESPONSE_KEYS = {
  nifty:       'NSE_INDEX:Nifty 50',
  banknifty:   'NSE_INDEX:Nifty Bank',
  vix:         'NSE_INDEX:India VIX',
  niftyit:     'NSE_INDEX:Nifty IT',
  niftyauto:   'NSE_INDEX:Nifty Auto',
  niftypharma: 'NSE_INDEX:Nifty Pharma',
  niftyfmcg:   'NSE_INDEX:Nifty FMCG',
  niftymetal:  'NSE_INDEX:Nifty Metal',
  niftyrealty: 'NSE_INDEX:Nifty Realty',
  niftyenergy: 'NSE_INDEX:Nifty Energy',
  niftyinfra:  'NSE_INDEX:Nifty Infra',
};

async function getUsdInr() {
  try {
    const r = await fetch('https://api.frankfurter.app/latest?from=USD&to=INR');
    const d = await r.json();
    return d.rates?.INR?.toFixed(2) || null;
  } catch { return null; }
}

async function getSensex(token) {
  const keys = ['BSE_INDEX|SENSEX', 'BSE_INDEX|S&P BSE SENSEX', 'BSE_INDEX|Sensex'];
  for (const k of keys) {
    try {
      const r = await fetch(`https://api.upstox.com/v2/market-quote/quotes?instrument_key=${encodeURIComponent(k)}`, {
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
      });
      const d = await r.json();
      const dataKey = Object.keys(d.data || {})[0];
      if (dataKey && d.data[dataKey]?.last_price) {
        const q = d.data[dataKey];
        const ltp = q.last_price;
        const prev = q.ohlc?.close || ltp;
        const ch = ltp - prev;
        const pct = prev ? (ch / prev * 100) : 0;
        return {
          val: ltp.toLocaleString('en-IN', { maximumFractionDigits: 2 }),
          ch: (ch >= 0 ? '+' : '') + ch.toFixed(2),
          pct: (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%',
          up: ch >= 0
        };
      }
    } catch(e) {}
  }
  return null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const token = process.env.UPSTOX_ACCESS_TOKEN;
  if (!token) return res.status(500).json({ error: 'UPSTOX_ACCESS_TOKEN not configured' });

  try {
    // Fetch all instruments + USD/INR + Sensex in parallel
    const instrKeys = Object.entries(INSTRUMENTS)
      .filter(([k]) => k !== 'sensex' && k !== 'usdinr')
      .map(([, v]) => v).join(',');

    const [quoteRes, usdInr, sensex] = await Promise.all([
      fetch(`https://api.upstox.com/v2/market-quote/quotes?instrument_key=${encodeURIComponent(instrKeys)}`, {
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
      }),
      getUsdInr(),
      getSensex(token)
    ]);

    const quoteData = await quoteRes.json();
    if (quoteData.status === 'error') throw new Error(JSON.stringify(quoteData.errors));

    const result = {};

    // Parse indices
    for (const [name, responseKey] of Object.entries(RESPONSE_KEYS)) {
      const q = quoteData.data?.[responseKey];
      if (!q) continue;
      const ltp = q.last_price || 0;
      const prev = q.ohlc?.close || ltp;
      const ch = ltp - prev;
      const pct = prev ? (ch / prev * 100) : 0;
      result[name] = {
        val: ltp.toLocaleString('en-IN', { maximumFractionDigits: 2 }),
        ch: (ch >= 0 ? '+' : '') + ch.toFixed(2),
        pct: (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%',
        up: ch >= 0
      };
    }

    // Add Sensex
    if (sensex) result.sensex = sensex;

    // Add USD/INR
    if (usdInr) result.usdinr = { val: '₹' + usdInr, ch: '', pct: '', up: true };

    // Sector mood
    const sectors = ['niftyit','niftyauto','niftypharma','niftyfmcg','niftymetal','niftyrealty','niftyenergy','niftyinfra'];
    let bull = 0, bear = 0;
    sectors.forEach(s => { if (result[s]) result[s].up ? bull++ : bear++; });
    const total = bull + bear || 1;
    result.mood = {
      label: bull > bear ? 'BULLISH' : bear > bull ? 'BEARISH' : 'NEUTRAL',
      bullPct: Math.round(bull / total * 100),
      bearPct: Math.round(bear / total * 100),
      bull, bear
    };

    return res.status(200).json(result);
  } catch (err) {
    console.error('Market error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
