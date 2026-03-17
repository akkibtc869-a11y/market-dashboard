export default async function handler(req, res) {
  const { code } = req.query;
  if (!code) return res.status(400).send('No auth code received');

  const apiKey = process.env.UPSTOX_API_KEY;
  const apiSecret = process.env.UPSTOX_API_SECRET;
  const redirectUri = process.env.UPSTOX_REDIRECT_URI || 'https://market-dashboard-rosy.vercel.app/api/auth';

  try {
    const tokenRes = await fetch('https://api.upstox.com/v2/login/authorization/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
      body: new URLSearchParams({
        code,
        client_id: apiKey,
        client_secret: apiSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      })
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) throw new Error(tokenData.message || 'Token exchange failed');

    const token = tokenData.access_token;
    // Redirect to dashboard with token in hash (never in query string)
    return res.redirect(302, `/?token=${encodeURIComponent(token)}`);
  } catch (err) {
    console.error('Auth error:', err);
    return res.status(500).send(`Auth failed: ${err.message}`);
  }
}
