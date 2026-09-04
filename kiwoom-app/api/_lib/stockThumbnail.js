// Builds a free stock-logo thumbnail URL, given a Kiwoom stock code (stk_cd).
//
// Naver's old imgstock.naver.com/upload/company/{code}.png host blocks
// hotlinking (every request fails), so instead we key a small map of
// known KRX codes -> company domain and fetch a favicon via Google's
// free, no-key-required favicon service. Codes not in the map return
// null, and the frontend falls back to an initial-letter avatar.

const STOCK_DOMAINS = {
  '005930': 'samsung.com',
  '000660': 'skhynix.com',
  '035720': 'kakaocorp.com',
  '035420': 'navercorp.com',
  '373220': 'lgensol.com',
  '323410': 'kakaobank.com',
  '068270': 'celltrion.com',
  '003670': 'posco-futurem.com',
  '247540': 'ecoprobm.co.kr',
  '329180': 'hd-hhi.com',
  '051910': 'lgchem.com',
  '034020': 'doosanenerbility.com',
  '006400': 'samsungsdi.com',
};

export function getThumbnailUrl(rawCode) {
  const code = String(rawCode || '').match(/\d{6}/)?.[0];
  const domain = code && STOCK_DOMAINS[code];
  if (!domain) return null;
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
}
