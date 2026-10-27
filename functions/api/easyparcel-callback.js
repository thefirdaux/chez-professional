/*
 * GET /api/easyparcel-callback?code=…&state=…
 * EasyParcel sends the admin back here after signing in. The admin cookie isn't sent on this
 * cross-site return (it is SameSite=Strict), so the one-time `state` saved by
 * /api/admin/easyparcel-connect is what proves the sign-in was started from the admin.
 */
import { ensureSchema, isConfigured } from '../_lib/orders.js';
import { easyParcelReady, finishConnect, EasyParcelError } from '../_lib/easyparcel.js';

function backToAdmin(request, result, reason) {
  const url = new URL('/admin/', request.url);
  url.searchParams.set('easyparcel', result);
  if (reason) url.searchParams.set('reason', reason.slice(0, 200));
  return new Response(null, { status: 302, headers: { Location: url.toString(), 'Cache-Control': 'no-store' } });
}

export async function onRequestGet({ request, env }) {
  if (!isConfigured(env) || !easyParcelReady(env)) return backToAdmin(request, 'failed', 'EasyParcel is not set up on this site.');
  await ensureSchema(env.DB);
  const url = new URL(request.url);
  // EasyParcel sends an error instead of a code if access was refused
  const refused = url.searchParams.get('error_description') || url.searchParams.get('error');
  if (refused && !url.searchParams.get('code')) return backToAdmin(request, 'failed', 'EasyParcel: ' + refused);
  try {
    await finishConnect(env, {
      code: url.searchParams.get('code'),
      state: url.searchParams.get('state'),
      redirectUri: url.origin + url.pathname
    });
  } catch (error) {
    if (error instanceof EasyParcelError) {
      console.error('EasyParcel connect failed:', error.message);
      return backToAdmin(request, 'failed', error.message);
    }
    throw error;
  }
  return backToAdmin(request, 'connected');
}
