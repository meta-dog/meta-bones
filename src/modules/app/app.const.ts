export const MAX_PENDING_ATTEMPTS = 30;
export const REFERRAL_BASE_URL = 'https://www.oculus.com/appreferrals';
export const PLATFORM_BASE_URL = 'https://www.oculus.com/experiences';
export const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/105.0.0.0 Safari/537.36';
export const HEADERS = {
  'User-Agent': BROWSER_USER_AGENT,
  'Accept-Language': 'en-GB,en;q=0.9',
  accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
  'sec-ch-ua-platform': 'Windows',
  'sec-ch-ua':
    'Google Chrome";v="105", "Not)A;Brand";v="8", "Chromium";v="105"',
  'sec-ch-ua-mobile': '?0',
  'sec-fetch-dest': 'Document',
  'sec-fetch-mode': 'navigate',
  'sec-fetch-site': 'none',
  'sec-fetch-user': '?1',
  'upgrade-insecure-requests': '1',
  dnt: '1',
};

export const DEFAULT_CRAWLER: 'axios' | 'puppeteer' = 'puppeteer';
export const INVALID_LINK_TEXT = '<title>Error</title>';
export const MINUTES_CRON = 30;
