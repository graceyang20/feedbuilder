// GET /api/kiwoom/ranking?type=up|down
//
// Wraps Kiwoom TR ka10027 (전일대비등락률상위요청) for the domestic
// market's top gainers (sort_tp: "1" 상승률) or top losers
// (sort_tp: "3" 하락률), per the official spec. Only these two sort
// types are wired up - "거래대금" (trading value) ranking needs a
// different TR not covered in this pass, so that tab in the UI stays
// on its existing placeholder values.

import { getValidToken } from '../_lib/kiwoomToken.js';
import { getThumbnailUrl } from '../_lib/stockThumbnail.js';

const SORT_TYPE = { up: '1', down: '3' };

function formatPrice(rawNumStr) {
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
    const type = req.query.type === 'down' ? 'down' : 'up';
    const token = await getValidToken();
    const baseUrl = process.env.KIWOOM_BASE_URL || 'https://mockapi.kiwoom.com';

    const response = await fetch(`${baseUrl}/api/dostk/rkinfo`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json;charset=UTF-8',
        authorization: `Bearer ${token.token}`,
        'api-id': 'ka10027',
        'cont-yn': 'N',
        'next-key': '',
      },
      body: JSON.stringify({
        mrkt_tp: '000',
        sort_tp: SORT_TYPE[type],
        trde_qty_cnd: '0000',
        stk_cnd: '1', // 관리종목제외
        crd_cnd: '0',
        updown_incls: '0',
        pric_cnd: '0',
        trde_prica_cnd: '0',
        stex_tp: '3',
      }),
    });

    const body = await response.json().catch(() => ({}));

    if (!response.ok || (body.return_code !== undefined && body.return_code !== 0)) {
      throw new Error(
        `Kiwoom ka10027 failed (HTTP ${response.status}): ${
          body.return_msg || response.statusText
        }`
      );
    }

    const list = body.pred_pre_flu_rt_upper;
    if (!Array.isArray(list)) {
      throw new Error(`Kiwoom ka10027 response missing expected list: ${JSON.stringify(body)}`);
    }

    const rows = list.slice(0, 5).map((item) => ({
      code: item.stk_cd,
      name: item.stk_nm,
      price: formatPrice(item.cur_prc),
      changePct: formatPct(item.flu_rt),
      up: item.pred_pre_sig === '1' || item.pred_pre_sig === '2',
      thumbnailUrl: getThumbnailUrl(item.stk_cd),
    }));

    res.status(200).json({ type, rows, source: 'kiwoom:ka10027' });
  } catch (err) {
    res.status(502).json({ error: String(err.message || err) });
  }
}
