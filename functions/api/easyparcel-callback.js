/*
 * GET /api/easyparcel-callback?code=…&state=…
 * EasyParcel sends the admin back here after signing in. The admin cookie isn't sent on this
 * cross-site return (it is SameSite=Strict), so the one-time `state` saved by
 * /api/admin/easyparcel-connect is what proves the sign-in was started from the admin.
 */
import { ensureSchema, isConfigured } from '../_lib/orders.js';
import { easyParcelReady, finishConnect, EasyParcelError } from '../_lib/easyparcel.js';

function backToAdmin(request, result) {
  return new Response(null, {
    status: 302,
    headers: { Location: new URL('/admin/?easyparcel=' + result, request.url).toString(), 'Cache-Control': 'no-store' }
  });
}

export async function onRequestGet({ request, env }) {
  if (!isConfigured(env) || !easyParcelReady(env)) return backToAdmin(request, 'failed');
  await ensureSchema(env.DB);
  const url = new URL(request.url);
  try {
    await finishConnect(env, {
      code: url.searchParams.get('code'),
      state: url.searchParams.get('state'),
      redirectUri: url.origin + url.pathname
    });
  } catch (error) {
    if (error instanceof EasyParcelError) {
      console.error('EasyParcel connect failed:', error.message);
      return backToAdmin(request, 'failed');
    }
    throw error;
  }
  return backToAdmin(request, 'connected');
}
