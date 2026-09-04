// Builds a free stock-logo thumbnail URL from Naver Finance's static
// image host, given a Kiwoom stock code (stk_cd).
//
// Naver serves company logos at:
//   https://imgstock.naver.com/upload/company/{code}.png
// where {code} is the plain 6-digit KRX ticker - no market suffix.
// Kiwoom sometimes returns stk_cd with a market suffix attached
// (e.g. "005930_AL"), so we pull out just the 6-digit code first.

export function getThumbnailUrl(rawCode) {
  const code = String(rawCode || '').match(/\d{6}/)?.[0];
  if (!code) return null;
  return `https://imgstock.naver.com/upload/company/${code}.png`;
}
