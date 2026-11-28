/*
 * GET /api/site-config  — public settings every page needs: the Meta Pixel ID (or null).
 * Cached for a few minutes, so a new ID set in the admin reaches visitors within 5 minutes.
 */
import { getPixelId } from '../_lib/meta.js';
import { json } from '../_lib/http.js';

export async function onRequestGet({ env }) {
  return json({ metaPixelId: await getPixelId(env) }, 200, { 'Cache-Control': 'public, max-age=300' });
}
