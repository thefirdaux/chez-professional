/*
 * GET /api/admin/easyparcel-connect  (signed-in admin only)
 * Sends the admin to EasyParcel's sign-in page; EasyParcel then returns to /api/easyparcel-callback.
 */
import { ensureSchema, isConfigured } from '../../_lib/orders.js';
import { requireAdmin } from '../../_lib/access.js';
import { json } from '../../_lib/http.js';
import { authorizeUrl, easyParcelReady } from '../../_lib/easyparcel.js';

export async function onRequestGet({ request, env }) {
  if (!isConfigured(env) || !easyParcelReady(env)) return json({ error: 'EasyParcel is not set up yet.' }, 503);
  const admin = await requireAdmin(request, env);
  if (admin.error) return Response.redirect(new URL('/admin/', request.url).toString(), 302);
  await ensureSchema(env.DB);
  const redirectUri = new URL('/api/easyparcel-callback', request.url).toString();
  return new Response(null, { status: 302, headers: { Location: await authorizeUrl(env, redirectUri), 'Cache-Control': 'no-store' } });
}
