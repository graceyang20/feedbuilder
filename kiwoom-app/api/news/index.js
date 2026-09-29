// GET /api/news?q=삼성전자&n=3&thumb=1
//
// 네이버 검색 API(뉴스)로 최신 기사를 받아와서 화면에 필요한 형태로만
// 정리해서 돌려준다. 키는 Vercel 환경변수(NAVER_CLIENT_ID /
// NAVER_CLIENT_SECRET)에서만 읽기 때문에 브라우저에는 노출되지 않는다.
//
// - q     : 검색어 (종목명, "증시" 등)
// - n     : 몇 건 돌려줄지 (1~10, 기본 3)
// - thumb : 1이면 기사 원문의 og:image를 찾아 썸네일로 붙인다
//           (네이버 뉴스 API는 이미지를 주지 않음). 원문 사이트가 느리거나
//           막혀 있으면 그 기사만 썸네일 없이 내려간다.
//
// 응답: { query, items: [{ title, url, source, domain, logo, publishedAt, thumbnail }] }
// 같은 검색어는 Vercel 엣지에서 5분간 캐시되어 네이버 호출량을 아낀다.

// 원문 링크 도메인 → 언론사 이름. 목록에 없으면 도메인을 그대로 보여준다.
const SOURCES = [
  ['yna.co.kr', '연합뉴스'], ['yonhapnewstv.co.kr', '연합뉴스TV'], ['einfomax.co.kr', '연합인포맥스'],
  ['hankyung.com', '한국경제'], ['wowtv.co.kr', '한국경제TV'], ['mk.co.kr', '매일경제'], ['mbn.co.kr', 'MBN'],
  ['biz.chosun.com', '조선비즈'], ['chosun.com', '조선일보'], ['joongang.co.kr', '중앙일보'], ['donga.com', '동아일보'],
  ['hani.co.kr', '한겨레'], ['khan.co.kr', '경향신문'], ['hankookilbo.com', '한국일보'], ['seoul.co.kr', '서울신문'],
  ['munhwa.com', '문화일보'], ['kmib.co.kr', '국민일보'], ['segye.com', '세계일보'],
  ['mt.co.kr', '머니투데이'], ['edaily.co.kr', '이데일리'], ['sedaily.com', '서울경제'], ['fnnews.com', '파이낸셜뉴스'],
  ['asiae.co.kr', '아시아경제'], ['heraldcorp.com', '헤럴드경제'], ['news1.kr', '뉴스1'], ['newsis.com', '뉴시스'],
  ['etoday.co.kr', '이투데이'], ['newspim.com', '뉴스핌'], ['thebell.co.kr', '더벨'], ['businesspost.co.kr', '비즈니스포스트'],
  ['bizwatch.co.kr', '비즈워치'], ['ajunews.com', '아주경제'], ['inews24.com', '아이뉴스24'], ['dt.co.kr', '디지털타임스'],
  ['etnews.com', '전자신문'], ['zdnet.co.kr', '지디넷코리아'], ['dailian.co.kr', '데일리안'], ['nocutnews.co.kr', '노컷뉴스'],
  ['kbs.co.kr', 'KBS'], ['imbc.com', 'MBC'], ['sbs.co.kr', 'SBS'], ['ytn.co.kr', 'YTN'], ['jtbc.co.kr', 'JTBC'],
  ['ohmynews.com', '오마이뉴스'], ['pressian.com', '프레시안'], ['sisajournal-e.com', '시사저널e'],
];

function sourceFor(host) {
  const h = host.replace(/^www\./, '');
  const hit = SOURCES.find(([d]) => h === d || h.endsWith(`.${d}`));
  return hit ? hit[1] : h;
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', middot: '·', hellip: '…', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”' };
function cleanText(s) {
  return String(s || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m)
    .replace(/\s+/g, ' ')
    .trim();
}

// 같은 사건을 여러 매체가 거의 같은 제목으로 쓰는 경우가 많아서 앞부분이
// 겹치는 제목은 하나만 남긴다.
function titleKey(t) {
  return t.replace(/[^0-9A-Za-z가-힣]/g, '').slice(0, 18);
}

async function fetchWithTimeout(url, options = {}, ms = 2500) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function findOgImage(pageUrl) {
  try {
    const res = await fetchWithTimeout(pageUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FeedBuilderBot/1.0)' },
      redirect: 'follow',
    });
    if (!res.ok) return null;
    const html = (await res.text()).slice(0, 300000);
    const m =
      html.match(/<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]*content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
    if (!m) return null;
    const img = new URL(cleanText(m[1]), pageUrl);
    return img.protocol === 'https:' ? img.href : null; // http 이미지는 브라우저가 막으므로 제외
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  try {
    const clientId = process.env.NAVER_CLIENT_ID;
    const clientSecret = process.env.NAVER_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new Error('NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 환경변수가 설정되지 않았어요.');
    }

    const query = String(req.query.q || '').trim().slice(0, 50);
    if (!query) {
      res.status(400).json({ error: 'q 파라미터가 필요해요.' });
      return;
    }
    const n = Math.min(10, Math.max(1, Number(req.query.n) || 3));
    const withThumb = req.query.thumb === '1';

    const url = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(query)}&display=${Math.min(30, n * 4)}&sort=date`;
    const response = await fetchWithTimeout(url, {
      headers: { 'X-Naver-Client-Id': clientId, 'X-Naver-Client-Secret': clientSecret },
    }, 5000);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(`Naver news API failed (HTTP ${response.status}): ${body.errorMessage || response.statusText}`);
    }

    const seen = new Set();
    const picked = [];
    for (const item of body.items || []) {
      const title = cleanText(item.title);
      const link = item.originallink || item.link;
      if (!title || !link) continue;
      const key = titleKey(title);
      if (seen.has(key)) continue;
      seen.add(key);
      let host;
      try { host = new URL(link).hostname; } catch { continue; }
      const published = new Date(item.pubDate);
      picked.push({
        title,
        url: link,
        source: sourceFor(host),
        domain: host.replace(/^www\./, ''),
        logo: `https://www.google.com/s2/favicons?domain=${host}&sz=64`,
        publishedAt: Number.isNaN(published.getTime()) ? null : published.toISOString(),
        thumbnail: null,
      });
      if (picked.length >= n) break;
    }

    if (withThumb) {
      const thumbs = await Promise.all(picked.map((p) => findOgImage(p.url)));
      thumbs.forEach((t, i) => { picked[i].thumbnail = t; });
    }

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    res.status(200).json({ query, items: picked, source: 'naver:search-news' });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
}
