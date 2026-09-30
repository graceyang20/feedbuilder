// GET /api/kiwoom/close-review
//
// 장마감 리뷰 카드에 필요한 실데이터를 키움 TR 여러 개에서 한 번에 모아
// 화면이 바로 쓸 수 있는 형태로 돌려준다. TR마다 따로 실패할 수 있으므로
// Promise.allSettled로 부분 성공을 허용하고, 실패한 조각은 null로 내려서
// 프론트가 그 부분만 목업으로 채우게 한다.
//
//   market   ka20001 업종현재가요청      - 코스피 종가·등락률·전일대비
//   chart    ka20005 업종분봉조회요청    - 코스피 5분봉 (장중 차트)
//   sectors  ka20003 전업종지수요청      - 코스피 업종별 등락률 상위 5 + 상승/하락 종목수
//   flows    ka10051 업종별투자자순매수요청 - 외국인/기관/개인 순매수 (코스피 종합)
//   frgnTop  ka90009 외국인기관매매상위요청 - 외국인·기관 순매수 상위 종목
//   movers   ka10027 전일대비등락률상위요청 - 상승률 1위 / 하락률 1위 (주목할 종목)
//
// 요청 파라미터 값은 키움 공식 가이드 기준. 단위(특히 순매수 금액)는
// 실서버 응답으로 한 번 확인이 필요해서 주석으로 표시해 둠.

import { getValidToken } from '../_lib/kiwoomToken.js';

const UP = ['1', '2']; // 대비기호 1 상한, 2 상승, 3 보합, 4 하한, 5 하락

// 코스피 업종 중 '업종'이 아닌 지수(종합, 규모별, KOSPI200 등)는 섹터 순위에서 제외
const NON_SECTOR_CODES = new Set(['001', '002', '003', '004', '201', '202', '203', '204', '205', '301', '302', '603', '604', '605', '701']);

function num(raw) {
  const n = Number(String(raw ?? '').replace(/,/g, ''));
  return Number.isNaN(n) ? null : n;
}
function kstToday() {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

async function callTr(path, apiId, body) {
  const token = await getValidToken();
  const baseUrl = process.env.KIWOOM_BASE_URL || 'https://mockapi.kiwoom.com';
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json;charset=UTF-8',
      authorization: `Bearer ${token.token}`,
      'api-id': apiId,
      'cont-yn': 'N',
      'next-key': '',
    },
    body: JSON.stringify(body),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || (json.return_code !== undefined && json.return_code !== 0)) {
    throw new Error(`${apiId} failed (HTTP ${response.status}): ${json.return_msg || response.statusText}`);
  }
  return json;
}

async function getMarket() {
  const b = await callTr('/api/dostk/sect', 'ka20001', { mrkt_tp: '0', inds_cd: '001' });
  const value = Math.abs(num(b.cur_prc));
  const change = Math.abs(num(b.pred_pre));
  const up = UP.includes(String(b.pred_pre_sig));
  if (!value) throw new Error('ka20001 missing cur_prc');
  return {
    value,
    change,
    pct: Math.abs(num(b.flu_rt)),
    up,
    flat: String(b.pred_pre_sig) === '3',
    prevClose: up ? value - change : value + change,
    high: Math.abs(num(b.high_pric)) || null,
    low: Math.abs(num(b.low_pric)) || null,
  };
}

async function getChart(marketValue) {
  const b = await callTr('/api/dostk/chart', 'ka20005', { inds_cd: '001', tic_scope: '5', base_dt: kstToday() });
  const list = b.inds_min_pole_qry;
  if (!Array.isArray(list) || !list.length) throw new Error('ka20005 empty');
  // 최신순으로 오므로, 가장 최근 거래일(첫 항목 날짜)의 봉만 골라 시간순으로 뒤집는다
  const day = String(list[0].cntr_tm).slice(0, 8);
  let pts = list
    .filter((x) => String(x.cntr_tm).startsWith(day))
    .map((x) => ({ t: String(x.cntr_tm).slice(8, 12), v: Math.abs(num(x.cur_prc)) }))
    .filter((p) => p.v)
    .reverse();
  // 분봉 가격이 소수점 없이(×100) 올 수 있어 현재가와 비교해 스케일을 맞춘다
  if (marketValue && pts.length) {
    const ratio = pts[pts.length - 1].v / marketValue;
    if (ratio > 50) pts = pts.map((p) => ({ ...p, v: p.v / 100 }));
  }
  return { day, points: pts };
}

async function getSectors() {
  const b = await callTr('/api/dostk/sect', 'ka20003', { inds_cd: '001' });
  const list = b.all_inds_idex;
  if (!Array.isArray(list)) throw new Error('ka20003 missing list');
  const kospi = list.find((x) => String(x.stk_cd).endsWith('001'));
  const rows = list
    .filter((x) => !NON_SECTOR_CODES.has(String(x.stk_cd).slice(-3)))
    .map((x) => {
      const r = num(x.flu_rt) ?? 0;
      const up = UP.includes(String(x.pre_sig)) || (!['4', '5'].includes(String(x.pre_sig)) && r > 0);
      return { name: String(x.stk_nm || '').trim(), pct: Math.abs(r), up };
    })
    .filter((x) => x.name)
    .sort((a, b2) => (b2.up ? b2.pct : -b2.pct) - (a.up ? a.pct : -a.pct));
  return {
    top: rows.slice(0, 5),
    total: rows.length,
    risingSectors: rows.filter((r) => r.up && r.pct > 0).length,
    rising: kospi ? num(kospi.rising) : null,
    falling: kospi ? num(kospi.fall) : null,
  };
}

async function getFlows() {
  // amt_qty_tp 0: 금액. 금액 단위는 가이드상 백만원으로 보고 억원으로 환산 (실서버 확인 필요)
  const b = await callTr('/api/dostk/sect', 'ka10051', { mrkt_tp: '0', amt_qty_tp: '0', base_dt: kstToday(), stex_tp: '3' });
  const list = b.inds_netprps;
  if (!Array.isArray(list)) throw new Error('ka10051 missing list');
  const row = list.find((x) => String(x.inds_cd).endsWith('001')) || list[0];
  const toEok = (v) => { const n = num(v); return n == null ? null : Math.round(n / 100); };
  return {
    foreign: toEok(row.frgnr_netprps),
    institution: toEok(row.orgn_netprps),
    individual: toEok(row.ind_netprps),
  };
}

async function getForeignTop() {
  const b = await callTr('/api/dostk/rkinfo', 'ka90009', { mrkt_tp: '001', amt_qty_tp: '1', qry_dt_tp: '0', date: kstToday(), stex_tp: '3' });
  const list = b.frgnr_orgn_trde_upper;
  if (!Array.isArray(list)) throw new Error('ka90009 missing list');
  const clean = (s) => String(s || '').trim();
  return {
    foreign: list.map((x) => clean(x.for_netprps_stk_nm)).filter(Boolean).slice(0, 3),
    institution: list.map((x) => clean(x.orgn_netprps_stk_nm)).filter(Boolean).slice(0, 3),
  };
}

async function getMover(sortTp) {
  const b = await callTr('/api/dostk/rkinfo', 'ka10027', {
    mrkt_tp: '001', sort_tp: sortTp, trde_qty_cnd: '0100', stk_cnd: '1', crd_cnd: '0',
    updown_incls: '1', pric_cnd: '0', trde_prica_cnd: '0', stex_tp: '3',
  });
  const x = (b.pred_pre_flu_rt_upper || [])[0];
  if (!x) throw new Error('ka10027 empty');
  return {
    name: String(x.stk_nm).trim(),
    code: String(x.stk_cd).replace(/_.*$/, ''),
    pct: Math.abs(num(x.flu_rt)),
    price: Math.abs(num(x.cur_prc)),
    up: UP.includes(String(x.pred_pre_sig)),
  };
}

export default async function handler(req, res) {
  const market = await getMarket().catch((e) => ({ error: String(e.message || e) }));
  const [chart, sectors, flows, frgnTop, gainer, loser] = await Promise.allSettled([
    getChart(market.value),
    getSectors(),
    getFlows(),
    getForeignTop(),
    getMover('1'),
    getMover('3'),
  ]);
  const val = (r) => (r.status === 'fulfilled' ? r.value : null);
  const errors = {};
  if (market.error) errors.market = market.error;
  [['chart', chart], ['sectors', sectors], ['flows', flows], ['frgnTop', frgnTop], ['gainer', gainer], ['loser', loser]]
    .forEach(([k, r]) => { if (r.status === 'rejected') errors[k] = String(r.reason?.message || r.reason); });

  res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300');
  res.status(200).json({
    asOf: new Date().toISOString(),
    market: market.error ? null : market,
    chart: val(chart),
    sectors: val(sectors),
    flows: val(flows),
    frgnTop: val(frgnTop),
    movers: [val(loser), val(gainer)].filter(Boolean),
    errors,
    source: 'kiwoom:ka20001,ka20005,ka20003,ka10051,ka90009,ka10027',
  });
}
