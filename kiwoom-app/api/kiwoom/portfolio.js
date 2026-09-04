// GET /api/kiwoom/portfolio
//
// Wraps Kiwoom TR kt00004 (계좌평가현황요청) to get the logged-in
// account's total evaluation amount and overall profit/loss, for the
// 포트폴리오 card's "총 평가액" + 등락률.
//
// NOTE: unlike ka20001/ka10027, kt00004's request body isn't fully
// spelled out in the public guide page at the time this was written.
// qry_tp ('0' 합산 조회) and dmst_stex_tp ('KRX') are the commonly
// used defaults across Kiwoom's other account-status TRs - adjust
// here if the real spec calls for something different.

import { getValidToken } from '../_lib/kiwoomToken.js';

function formatWon(rawNumStr) {
  const n = Number(rawNumStr);
  if (Number.isNaN(n)) return rawNumStr;
  return `${Math.abs(n).toLocaleString('ko-KR')}원`;
}

function formatPct(rawPctStr) {
  const n = Number(rawPctStr);
  if (Number.isNaN(n)) return rawPctStr;
  return `${Math.abs(n).toFixed(2)}%`;
}

export default async function handler(req, res) {
  try {
    const token = await getValidToken();
    const baseUrl = process.env.KIWOOM_BASE_URL || 'https://mockapi.kiwoom.com';

    const response = await fetch(`${baseUrl}/api/dostk/acnt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json;charset=UTF-8',
        authorization: `Bearer ${token.token}`,
        'api-id': 'kt00004',
        'cont-yn': 'N',
        'next-key': '',
      },
      body: JSON.stringify({ qry_tp: '0', dmst_stex_tp: 'KRX' }),
    });

    const body = await response.json().catch(() => ({}));

    if (!response.ok || (body.return_code !== undefined && body.return_code !== 0)) {
      throw new Error(
        `Kiwoom kt00004 failed (HTTP ${response.status}): ${
          body.return_msg || response.statusText
        }`
      );
    }
    if (
      body.tot_evlt_amt === undefined ||
      body.tot_evltv_prft === undefined ||
      body.tot_prft_rt === undefined
    ) {
      throw new Error(`Kiwoom kt00004 response missing expected fields: ${JSON.stringify(body)}`);
    }

    const up = Number(body.tot_evltv_prft) >= 0;

    res.status(200).json({
      totalEvalAmount: formatWon(body.tot_evlt_amt),
      changeAmount: formatWon(body.tot_evltv_prft),
      changePct: formatPct(body.tot_prft_rt),
      up,
      source: 'kiwoom:kt00004',
    });
  } catch (err) {
    res.status(502).json({ error: String(err.message || err) });
  }
}
