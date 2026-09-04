// Shared Kiwoom OAuth token logic (au10001), used by every /api/kiwoom/*
// route. Kept in one place so token issuing/refresh logic isn't
// duplicated per-route. Each serverless function instance keeps its own
// in-memory cache (Vercel cold starts reset it) - fine for this scale.

let cachedToken = null; // { token, tokenType, expiresAt: Date }
const REFRESH_MARGIN_MS = 5 * 60 * 1000; // refresh 5 min before expiry

function parseExpiresDt(raw) {
  // raw looks like "20241107083713" -> YYYYMMDDHHMMSS, Korea time (UTC+9)
  const y = raw.slice(0, 4);
  const mo = raw.slice(4, 6);
  const d = raw.slice(6, 8);
  const h = raw.slice(8, 10);
  const mi = raw.slice(10, 12);
  const s = raw.slice(12, 14);
  return new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}+09:00`);
}

export async function issueNewToken() {
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

export async function getValidToken() {
  const now = Date.now();
  const needsRefresh =
    !cachedToken || cachedToken.expiresAt.getTime() - now < REFRESH_MARGIN_MS;
  if (needsRefresh) {
    await issueNewToken();
  }
  return cachedToken;
}

export function getCachedTokenStatus() {
  if (!cachedToken) return { issued: false };
  const t = cachedToken;
  const preview =
    t.token.length > 10 ? `${t.token.slice(0, 6)}...${t.token.slice(-4)}` : '***';
  return {
    issued: true,
    token_type: t.tokenType,
    token_preview: preview,
    expires_at: t.expiresAt.toISOString(),
    seconds_until_expiry: Math.max(0, Math.floor((t.expiresAt.getTime() - Date.now()) / 1000)),
  };
}

export function baseUrl() {
  return process.env.KIWOOM_BASE_URL || 'https://mockapi.kiwoom.com';
}
