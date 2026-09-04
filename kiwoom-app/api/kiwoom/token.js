// Vercel Serverless Function (Node.js runtime)
//
// GET  /api/kiwoom/token             -> returns current valid token status
//                                        (issues one if none cached / about to expire)
// GET  /api/kiwoom/token?refresh=1   -> forces a brand-new token right now
//
// Implements exactly the Kiwoom spec (kiwoom-rest-api-spec.json):
//   au10001 접근토큰 발급   POST {KIWOOM_BASE_URL}/oauth2/token
//     request : { grant_type: "client_credentials", appkey, secretkey }
//     response: { token, token_type, expires_dt, return_code, return_msg }
//
// KIWOOM_APP_KEY / KIWOOM_APP_SECRET / KIWOOM_BASE_URL come from Vercel
// Environment Variables (Project Settings -> Environment Variables).
// They are read here on the server only and are NEVER sent to the browser.
//
// Note on serverless: this function may "cold start" on a fresh Vercel
// instance, which resets the in-memory cache below. That just means an
// extra token request gets made occasionally - harmless for a demo app.

let cachedToken = null; // { token, tokenType, expiresAt: Date }
const REFRESH_MARGIN_MS = 5 * 60 * 1000; // refresh 5 min before expiry

function parseExpiresDt(raw) {
  // raw looks like "20241107083713" -> YYYYMMDDHHMMSS, Korea time (KST/UTC+9)
  const y = raw.slice(0, 4);
  const mo = raw.slice(4, 6);
  const d = raw.slice(6, 8);
  const h = raw.slice(8, 10);
  const mi = raw.slice(10, 12);
  const s = raw.slice(12, 14);
  return new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}+09:00`);
}

async function issueNewToken() {
  const baseUrl = process.env.KIWOOM_BASE_URL || 'https://mockapi.kiwoom.com';
  const appKey = process.env.KIWOOM_APP_KEY;
  const secretKey = process.env.KIWOOM_APP_SECRET;

  if (!appKey || !secretKey) {
    throw new Error(
      'KIWOOM_APP_KEY / KIWOOM_APP_SECRET are not set. Add them in ' +
        'Vercel Project Settings -> Environment Variables, then redeploy.'
    );
  }

  const response = await fetch(`${baseUrl}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json;charset=UTF-8' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      appkey: appKey,
      secretkey: secretKey,
    }),
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok || (body.return_code !== undefined && body.return_code !== 0)) {
    throw new Error(
      `Kiwoom token issue failed (HTTP ${response.status}): ${
        body.return_msg || response.statusText
      }`
    );
  }
  if (!body.token || !body.token_type || !body.expires_dt) {
    throw new Error(`Kiwoom response missing expected fields: ${JSON.stringify(body)}`);
  }

  cachedToken = {
    token: body.token,
    tokenType: body.token_type,
    expiresAt: parseExpiresDt(body.expires_dt),
  };
  return cachedToken;
}

async function getValidToken() {
  const now = Date.now();
  const needsRefresh =
    !cachedToken || cachedToken.expiresAt.getTime() - now < REFRESH_MARGIN_MS;
  if (needsRefresh) {
    await issueNewToken();
  }
  return cachedToken;
}

export default async function handler(req, res) {
  try {
    const forceRefresh = req.query.refresh === '1';
    const token = forceRefresh ? await issueNewToken() : await getValidToken();

    const preview =
      token.token.length > 10
        ? `${token.token.slice(0, 6)}...${token.token.slice(-4)}`
        : '***';

    res.status(200).json({
      issued: true,
      token_type: token.tokenType,
      token_preview: preview,
      expires_at: token.expiresAt.toISOString(),
      seconds_until_expiry: Math.max(
        0,
        Math.floor((token.expiresAt.getTime() - Date.now()) / 1000)
      ),
    });
  } catch (err) {
    res.status(502).json({ issued: false, error: String(err.message || err) });
  }
}
