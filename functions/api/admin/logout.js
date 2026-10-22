/*
 * POST /api/admin/logout   signs the admin out on this device
 */
import { blockedOrigin, signOutCookie } from '../../_lib/access.js';
import { json } from '../../_lib/http.js';

export async function onRequestPost({ request }) {
  if (blockedOrigin(request)) return json({ error: 'Request blocked.' }, 403);
  return json({ ok: true }, 200, { 'Set-Cookie': signOutCookie() });
}
