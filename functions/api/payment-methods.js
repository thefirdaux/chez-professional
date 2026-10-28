/*
 * GET /api/payment-methods
 * The payment methods CHIP has switched on, with their logos, for the footer on every page.
 * Methods CHIP switches on later (cards, e-wallets) appear by themselves. Kept for an hour so
 * visitors don't each ask CHIP.
 */
import { isConfigured } from '../_lib/orders.js';
import { json } from '../_lib/http.js';
import { paymentMethods } from '../_lib/chip.js';

const MAX_AGE = 3600;
// Change the version when the reply's shape changes, so the old cached copy isn't served
const CACHE_PATH = '/api/payment-methods?v=3';
// Card schemes CHIP lists without a logo; it hosts these under a fixed name
const CARDS = ['visa', 'mastercard', 'maestro'];
// Methods the shop doesn't want in the footer, even if CHIP switches them on
const HIDDEN = /apple|google|crypto/i;

/** One entry per logo: CHIP lists some methods twice (e.g. FPX for personal and business banking). */
function forFooter(methods) {
  const withLogos = [];
  const textOnly = [];
  const seen = new Set();
  const key = (name) => name.toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const method of methods) {
    if (HIDDEN.test(method.code) || HIDDEN.test(method.name)) continue;
    let logos = method.logos;
    if (!logos.length && CARDS.includes(method.code)) logos = ['https://gate.chip-in.asia/static/images/icon-' + method.code + '.svg'];
    const name = method.name.charAt(0).toUpperCase() + method.name.slice(1);
    (logos.length ? withLogos : textOnly).push({ name, logos });
  }
  return withLogos.concat(textOnly).filter((method) => {
    const keys = [key(method.name)].concat(method.logos);
    if (keys.some((k) => seen.has(k))) return false;
    keys.forEach((k) => seen.add(k));
    return true;
  });
}

export async function onRequestGet({ request, env, waitUntil }) {
  if (!isConfigured(env)) return json({ methods: [] });
  const cache = caches.default;
  const key = new Request(new URL(CACHE_PATH, request.url).toString());
  const hit = await cache.match(key);
  if (hit) return hit;
  try {
    const methods = forFooter(await paymentMethods(env));
    const response = json({ methods }, 200, { 'Cache-Control': 'public, max-age=' + MAX_AGE });
    waitUntil(cache.put(key, response.clone()));
    return response;
  } catch (error) {
    console.error(error.message);
    return json({ error: 'Payment methods are unavailable right now.' }, 503);
  }
}
