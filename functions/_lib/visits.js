/*
 * Cookie-free visitor counting for the admin analytics.
 * Nothing personal is stored: a visitor is a hash of (day, IP, browser) made with a
 * server secret, so it changes every day and can't be turned back into an IP address.
 */
const encoder = new TextEncoder();

/** The Malaysian calendar date (UTC+8) for a time, as YYYY-MM-DD. */
export function malaysiaDay(ms) {
  return new Date(ms + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export const PAGES = {
  '/': 'Home',
  '/index.html': 'Home',
  '/checkout': 'Checkout',
  '/checkout.html': 'Checkout',
  '/order-success': 'Thank you',
  '/order-success.html': 'Thank you'
};

const BOTS = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp\/|telegram|headless|lighthouse|curl|wget|python|monitor/i;

export function isBot(userAgent) {
  return !userAgent || BOTS.test(userAgent);
}

export function deviceOf(userAgent) {
  if (/iPad|Tablet|Android(?!.*Mobile)/i.test(userAgent)) return 'Tablet';
  if (/Mobi|iPhone|iPod|Android/i.test(userAgent)) return 'Phone';
  return 'Computer';
}

const NAMED = [
  ['WhatsApp', /whatsapp|wa\.me/i],
  ['TikTok', /tiktok|musical_ly|bytedance/i],
  ['Instagram', /instagram/i],
  ['Facebook', /facebook|fb\.me|\bfb\b|FBAN|FBAV|FB_IAB/i],
  ['Google', /google\./i],
  ['Other search', /bing\.|yahoo\.|duckduckgo|ecosia/i]
];

/** Where the visit came from: a utm_source tag, an in-app browser, or the referring site. */
export function sourceOf({ utm, referrer, userAgent, siteHost }) {
  for (const [name, pattern] of NAMED) if (utm && pattern.test(utm)) return name;
  if (utm) return 'Other';
  for (const [name, pattern] of NAMED.slice(0, 4)) if (pattern.test(userAgent || '')) return name;
  let host = '';
  try { host = referrer ? new URL(referrer).hostname : ''; } catch (e) { host = ''; }
  if (!host) return 'Direct';
  if (host === siteHost || host.endsWith('.' + siteHost.replace(/^www\./, ''))) return 'Internal';
  for (const [name, pattern] of NAMED) if (pattern.test(host)) return name;
  return 'Other websites';
}

export async function visitorId(secret, day, ip, userAgent) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(day + '|' + ip + '|' + userAgent));
  return Array.from(new Uint8Array(sig).slice(0, 8), (b) => b.toString(16).padStart(2, '0')).join('');
}
