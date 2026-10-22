/*
 * POST /api/admin/login   { password }   signs the admin in (sets a session cookie)
 */
import { ensureSchema, isConfigured } from '../../_lib/orders.js';
import { signIn } from '../../_lib/access.js';
import { json } from '../../_lib/http.js';

export async function onRequestPost({ request, env }) {
  if (!isConfigured(env)) return json({ error: 'Orders are not set up yet.' }, 503);
  await ensureSchema(env.DB);
  const result = await signIn(request, env);
  if (result.error) return json({ error: result.error }, result.status);
  return json({ ok: true }, 200, { 'Set-Cookie': result.cookie });
}
