const INSTRUMENTS = {
  nifty:       'NSE_INDEX|Nifty 50',
  banknifty:   'NSE_INDEX|Nifty Bank',
  vix:         'NSE_INDEX|India VIX',
  sensex:      'BSE_INDEX|S&P BSE SENSEX',
  niftyit:     'NSE_INDEX|Nifty IT',
  niftyauto:   'NSE_INDEX|Nifty Auto',
  niftypharma: 'NSE_INDEX|Nifty Pharma',
  niftyfmcg:   'NSE_INDEX|Nifty FMCG',
  niftymetal:  'NSE_INDEX|Nifty Metal',
  niftyrealty: 'NSE_INDEX|Nifty Realty',
  niftyenergy: 'NSE_INDEX|Nifty Energy',
  niftyinfra:  'NSE_INDEX|Nifty Infra',
};

async function getUsdInr() {
  try {
    const res = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/USDINR=X?interval=1m&range=1d', {
      signal: AbortSignal.timeout(5000)
    });
    const data = await res.json();
    const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
    const prev = data?.chart?.result?.[0]?.meta?.previousClose;
    if (!price) return null;
    const ch = price - (prev || price);
    const pct = prev ? (ch / prev) * 100 : 0;
    return {
      val: '₹' + price.toFixed(2),
      ch: (ch >= 0 ? '+' : '') + ch.toFixed(2),
      pct: (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%',
      up: ch >= 0,
      raw: price
    };
  } catch(e) {
    console.log('USD/INR error:', e.message);
    return null;
  }
}

async function getFiiDii() {
  try {
    // NSE FII/DII data
    const res = await fetch('https://www.nseindia.com/api/fiidiiTradeReact', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Referer': 'https://www.nseindia.com/reports/fii-dii'
      },
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) throw new Error('NSE HTTP ' + res.status);
    const data = await res.json();
    if (!data || !data.length) throw new Error('No NSE data');
    
    // Latest entry
    const latest = data[0];
    const fiiNet = parseFloat(latest.fiinet || latest.fii_net || 0);
    const diiNet = parseFloat(latest.diinet || latest.dii_net || 0);
    const date = latest.date || latest.tradeDate || 'Latest';
    
    return {
      fii_net: fiiNet >= 0 ? '+' + fiiNet.toFixed(0) : fiiNet.toFixed(0),
      fii_dir: fiiNet >= 0 ? 'buy' : 'sell',
      dii_net: diiNet >= 0 ? '+' + diiNet.toFixed(0) : diiNet.toFixed(0),
      dii_dir: diiNet >= 0 ? 'buy' : 'sell',
      date: date
    };
  } catch(e) {
    console.log('FII/DII NSE error:', e.message);
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const token = process.env.UPSTOX_ACCESS_TOKEN;
  if (!token) return res.status(500).json({ error: 'UPSTOX_ACCESS_TOKEN not set' });

  try {
    const keys = Object.values(INSTRUMENTS).join(',');
    const url = `https://api.upstox.com/v2/market-quote/quotes?instrument_key=${encodeURIComponent(keys)}`;

    const [upstoxRes, usdinr, fiidii] = await Promise.all([
      fetch(url, {
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
      }),
      getUsdInr(),
      getFiiDii()
    ]);

    const upstoxData = await upstoxRes.json();
    if (upstoxData.status === 'error') throw new Error(JSON.stringify(upstoxData.errors));

    const raw = upstoxData.data || {};

    function findData(name) {
      const instr = INSTRUMENTS[name];
      if (!instr) return null;
      const colonKey = instr.replace('|', ':');
      return raw[instr] || raw[colonKey] ||
        Object.entries(raw).find(([k]) => k.includes(instr.split('|')[1]))?.[1] || null;
    }

    function parseQuote(name) {
      const q = findData(name);
      if (!q) return null;
      const ltp = q.last_price || 0;
      // Use net_change directly from Upstox if available
      const ch = q.net_change !== undefined ? q.net_change : (ltp - (q.ohlc?.close || ltp));
      const pct = ltp ? (ch / (ltp - ch)) * 100 : 0;
      return {
        val: ltp.toLocaleString('en-IN', { maximumFractionDigits: 2 }),
        ch: (ch >= 0 ? '+' : '') + ch.toFixed(2),
        pct: (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%',
        up: ch >= 0,
        raw: ltp
      };
    }

    const result = {};
    for (const name of Object.keys(INSTRUMENTS)) {
      const q = parseQuote(name);
      if (q) result[name] = q;
    }

    if (usdinr) result.usdinr = usdinr;
    if (fiidii) result.fiidii = fiidii;

    // Sector mood
    const sectors = ['niftyit','niftyauto','niftypharma','niftyfmcg','niftymetal','niftyrealty','niftyenergy','niftyinfra'];
    let bullCount = 0, bearCount = 0;
    sectors.forEach(s => {
      if (result[s]) { result[s].up ? bullCount++ : bearCount++; }
    });
    const total = bullCount + bearCount || 1;
    result.mood = {
      label: bullCount > bearCount ? 'BULLISH' : bearCount > bullCount ? 'BEARISH' : 'NEUTRAL',
      bullPct: Math.round((bullCount / total) * 100),
      bearPct: Math.round((bearCount / total) * 100),
      bullCount,
      bearCount
    };

    console.log('Result keys:', Object.keys(result));
    return res.status(200).json(result);

  } catch(err) {
    console.error('Market error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
