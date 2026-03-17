export default async function handler(req, res) {
  const { code } = req.query;
  if (!code) return res.status(400).send('No auth code received');

  const apiKey = process.env.UPSTOX_API_KEY;
  const apiSecret = process.env.UPSTOX_API_SECRET;
  const redirectUri = process.env.UPSTOX_REDIRECT_URI || 'https://market-dashboard-rosy.vercel.app/api/auth';

  console.log('Auth attempt - API Key exists:', !!apiKey, 'Secret exists:', !!apiSecret);
  console.log('Redirect URI:', redirectUri);
  console.log('Code received:', code);

  try {
    const body = new URLSearchParams({
      code: code,
      client_id: apiKey,
      client_secret: apiSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code'
    });

    console.log('Sending to Upstox:', body.toString().replace(apiSecret, '***'));

    const tokenRes = await fetch('https://api.upstox.com/v2/login/authorization/token', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: body.toString()
    });

    const tokenData = await tokenRes.json();
    console.log('Upstox response status:', tokenRes.status);
    console.log('Upstox response:', JSON.stringify(tokenData));

    if (!tokenRes.ok || !tokenData.access_token) {
      throw new Error(JSON.stringify(tokenData));
    }

    const token = tokenData.access_token;
    return res.redirect(302, `/?token=${encodeURIComponent(token)}`);
  } catch (err) {
    console.error('Auth error full:', err.message);
    return res.status(500).send(`Auth failed: ${err.message}`);
  }
}
