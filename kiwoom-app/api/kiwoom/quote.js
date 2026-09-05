// GET /api/kiwoom/quote?codes=035720,035420,373220
//
// Wraps Kiwoom TR ka10001 (주식기본정보요청) to get each stock's
// current price and change rate. ka10001 only takes one stk_cd per
// call, so this loops the requested codes and fires them in
// parallel, returning a { [code]: { price, changePct, up } } map so
// the frontend can look results up by ticker.
//
// Field names (cur_prc / flu_rt / pred_pre_sig) follow the same
// convention already confirmed for ka20001 and ka10027 in this repo;
// worth double-checking against a live response if ka10001 turns out
// to shape its current-price fields differently.

import { getValidToken } from '../_lib/kiwoomToken.js';

function formatPct(rawPctStr) {
  const n = Number(rawPctStr);
  if (Number.isNaN(n)) return rawPctStr;
  return `${Math.abs(n).toFixed(2)}%`;
}

async function fetchQuote(code, token, baseUrl) {
  const response = await fetch(`${baseUrl}/api/dostk/stkinfo`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json;charset=UTF-8',
      authorization: `Bearer ${token.token}`,
      'api-id': 'ka10001',
      'cont-yn': 'N',
      'next-key': '',
    },
    body: JSON.stringify({ stk_cd: code }),
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok || (body.return_code !== undefined && body.return_code !== 0)) {
    throw new Error(`ka10001 failed for ${code} (HTTP ${response.status}): ${body.return_msg || response.statusText}`);
  }
  if (!body.cur_prc || !body.flu_rt || !body.pred_pre_sig) {
    throw new Error(`ka10001 response for ${code} missing expected fields: ${JSON.stringify(body)}`);
  }

  const up = body.pred_pre_sig === '1' || body.pred_pre_sig === '2';
  return {
    price: Math.abs(Number(body.cur_prc)),
    changePct: formatPct(body.flu_rt),
    changePctRaw: Number(body.flu_rt),
    up,
  };
}

export default async function handler(req, res) {
  try {
    const codes = String(req.query.codes || '')
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);

    if (codes.length === 0) {
      return res.status(400).json({ error: 'codes query param is required, e.g. ?codes=005930,035420' });
    }

    const token = await getValidToken();
    const baseUrl = process.env.KIWOOM_BASE_URL || 'https://mockapi.kiwoom.com';

    const results = await Promise.allSettled(codes.map((code) => fetchQuote(code, token, baseUrl)));

    const quotes = {};
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') quotes[codes[i]] = r.value;
    });

    res.status(200).json({ quotes, source: 'kiwoom:ka10001' });
  } catch (err) {
    res.status(502).json({ error: String(err.message || err) });
  }
}
