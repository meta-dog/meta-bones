export const REGIONS = [
  'ES',
  'UK',
  'US',
  'NL',
  'BE',
  'CA',
  'AU',
  'NZ',
  'IT',
  'AT',
  'KR',
  'PL',
  'IE',
  'UA',
  'DE',
  'FR',
  'JP',
  'NO',
  'CH',
  'SE',
];
export const MAX_PENDING_ATTEMPTS = 30;
export const DEVICE_REFERRAL_BASE_URL = 'https://www.meta.com/referrals/link';
export const MINUTES_CRON = 0;
export const INVALID_LINK_TEXT = '<title>Error</title>';
export const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/105.0.0.0 Safari/537.36';
export const HEADERS = {
  'User-Agent': BROWSER_USER_AGENT,
  'Accept-Language': 'en-GB,en;q=0.9',
  accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
  'sec-ch-ua-platform': 'Windows',
  'sec-ch-ua':
    'Google Chrome";v="108", "Not)A;Brand";v="8", "Chromium";v="108"',
  'sec-ch-ua-mobile': '?0',
  'sec-fetch-dest': 'Document',
  'sec-fetch-mode': 'navigate',
  'sec-fetch-site': 'none',
  'sec-fetch-user': '?1',
  'upgrade-insecure-requests': '1',
  dnt: '1',
};
export const CACHE_TTL_MS = 300 * 60 * 1000;
