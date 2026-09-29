// GET  /api/kiwoom/token             -> current valid token status (issues one if needed)
// GET  /api/kiwoom/token?refresh=1   -> force a brand-new token right now
import { getValidToken, issueNewToken, getCachedTokenStatus } from '../_lib/kiwoomToken.js';

export default async function handler(req, res) {
  try {
    const forceRefresh = req.query.refresh === '1';
    if (forceRefresh) {
      await issueNewToken();
    } else {
      await getValidToken();
    }
    res.status(200).json(getCachedTokenStatus());
  } catch (err) {
    res.status(502).json({ issued: false, error: String(err.message || err) });
  }
}
