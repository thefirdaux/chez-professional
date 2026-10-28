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

export async function onRequestGet({ request, env, waitUntil }) {
  if (!isConfigured(env)) return json({ methods: [] });
  const cache = caches.default;
  const key = new Request(new URL('/api/payment-methods', request.url).toString());
  const hit = await cache.match(key);
  if (hit) return hit;
  try {
    const methods = await paymentMethods(env);
    const response = json({ methods }, 200, { 'Cache-Control': 'public, max-age=' + MAX_AGE });
    waitUntil(cache.put(key, response.clone()));
    return response;
  } catch (error) {
    console.error(error.message);
    return json({ error: 'Payment methods are unavailable right now.' }, 503);
  }
}
