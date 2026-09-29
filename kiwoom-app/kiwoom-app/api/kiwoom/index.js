// GET /api/kiwoom/index
//
// Wraps Kiwoom TR ka20001 (업종현재가요청) for the domestic KOSPI index
// (mrkt_tp: "0" = 코스피, inds_cd: "001" = 종합(KOSPI)), per the official
// spec. This is the ONLY index in the UI's index card that Kiwoom's
// domestic-market TRs can actually provide - S&P 500 and the USD/KRW
// rate need separate TRs (미국지수 / 환전) not wired up in this pass, so
// the frontend leaves those two untouched.
//
// Response is normalized to exactly what the IndexCard component
// needs, so the raw Kiwoom field names never leak into the UI layer.

import { getValidToken } from '../_lib/kiwoomToken.js';

const KOSPI_REQUEST = { mrkt_tp: '0', inds_cd: '001' };

function formatValue(rawNumStr) {
  // Kiwoom returns numbers as signed strings, e.g. "-2394.49" or "+2687.32".
  const n = Number(rawNumStr);
  if (Number.isNaN(n)) return rawNumStr;
  return Math.abs(n).toLocaleString('ko-KR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
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

    const response = await fetch(`${baseUrl}/api/dostk/sect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json;charset=UTF-8',
        authorization: `Bearer ${token.token}`,
        'api-id': 'ka20001',
        'cont-yn': 'N',
        'next-key': '',
      },
      body: JSON.stringify(KOSPI_REQUEST),
    });

    const body = await response.json().catch(() => ({}));

    if (!response.ok || (body.return_code !== undefined && body.return_code !== 0)) {
      throw new Error(
        `Kiwoom ka20001 failed (HTTP ${response.status}): ${
          body.return_msg || response.statusText
        }`
      );
    }
    if (!body.cur_prc || !body.flu_rt || !body.pred_pre_sig) {
      throw new Error(`Kiwoom ka20001 response missing expected fields: ${JSON.stringify(body)}`);
    }

    // pred_pre_sig: 1 상한가, 2 상승, 3 보합, 4 하한가, 5 하락
    const up = body.pred_pre_sig === '1' || body.pred_pre_sig === '2';

    res.status(200).json({
      name: '코스피',
      value: formatValue(body.cur_prc),
      changePct: formatPct(body.flu_rt),
      up,
      source: 'kiwoom:ka20001',
    });
  } catch (err) {
    res.status(502).json({ error: String(err.message || err) });
  }
}
