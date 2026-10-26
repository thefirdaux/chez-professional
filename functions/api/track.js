/*
 * POST /api/track   { path, ref, utm }   records one page view for the admin analytics.
 * Sent by assets/track.js with navigator.sendBeacon; always answers 204.
 */
import { ensureSchema } from '../_lib/orders.js';
import { PAGES, isBot, deviceOf, sourceOf, visitorId, malaysiaDay } from '../_lib/visits.js';

const done = () => new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });

export async function onRequestPost({ request, env }) {
  if (!env.DB) return done();
  const url = new URL(request.url);
  if (request.headers.get('Origin') !== url.origin) return done();
  const userAgent = request.headers.get('User-Agent') || '';
  if (isBot(userAgent)) return done();

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return done();
  }
  const page = PAGES[String(body && body.path || '').split('?')[0]];
  if (!page) return done();

  const now = Date.now();
  const day = malaysiaDay(now);
  const ip = request.headers.get('CF-Connecting-IP') || '';
  const secret = env.ADMIN_PASSWORD || env.CHIP_SECRET_KEY || 'chez-professional';
  const source = sourceOf({
    utm: String(body.utm || '').slice(0, 40),
    referrer: String(body.ref || '').slice(0, 300),
    userAgent,
    siteHost: url.hostname
  });

  await ensureSchema(env.DB);
  await env.DB.prepare('INSERT INTO page_views (at, day, path, source, device, visitor) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(now, day, page, source, deviceOf(userAgent), await visitorId(secret, day, ip, userAgent))
    .run();
  // Keep a little over a year of history
  if (Math.random() < 0.01) {
    await env.DB.prepare('DELETE FROM page_views WHERE at < ?').bind(now - 400 * 24 * 60 * 60 * 1000).run();
  }
  return done();
}
