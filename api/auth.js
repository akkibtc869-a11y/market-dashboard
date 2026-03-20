export default async function handler(req, res) {
  const url = new URL(req.url, 'https://market-dashboard-rosy.vercel.app');
  const code = url.searchParams.get('code');
  
  if (!code) return res.status(400).send('No auth code received');

  const apiKey = process.env.UPSTOX_API_KEY;
  const apiSecret = process.env.UPSTOX_API_SECRET;
  const redirectUri = process.env.UPSTOX_REDIRECT_URI || 'https://market-dashboard-rosy.vercel.app/api/auth';

  console.log('Code received:', code ? 'yes' : 'no');
  console.log('API Key exists:', !!apiKey);
  console.log('API Secret exists:', !!apiSecret);

  try {
    const body = `code=${encodeURIComponent(code)}&client_id=${encodeURIComponent(apiKey)}&client_secret=${encodeURIComponent(apiSecret)}&redirect_uri=${encodeURIComponent(redirectUri)}&grant_type=authorization_code`;

    const tokenRes = await fetch('https://api.upstox.com/v2/login/authorization/token', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: body
    });

    const tokenData = await tokenRes.json();
    console.log('Token response status:', tokenRes.status);
    console.log('Has access_token:', !!tokenData.access_token);

    if (!tokenRes.ok || !tokenData.access_token) {
      console.error('Token error:', JSON.stringify(tokenData));
      throw new Error(JSON.stringify(tokenData));
    }

    const token = tokenData.access_token;
    console.log('Token generated successfully, redirecting...');
    
    // Use HTML redirect instead of res.redirect to avoid url.parse issues
    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(`
      <html>
        <script>
          localStorage.setItem('upstox_token', '${token}');
          window.location.href = '/';
        </script>
        <body>Redirecting... <a href="/">Click here if not redirected</a></body>
      </html>
    `);
  } catch (err) {
    console.error('Auth error:', err.message);
    return res.status(500).send(`Auth failed: ${err.message}`);
  }
}
