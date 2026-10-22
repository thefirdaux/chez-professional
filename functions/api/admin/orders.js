/*
 * GET  /api/admin/orders?status=paid|pending|shipped|all   list orders (newest first)
 * POST /api/admin/orders  { id, action: 'printed' | 'shipped' | 'unshipped' }
 * Both require a signed-in admin (see _lib/access.js and login.js).
 */
import { ensureSchema, isConfigured } from '../../_lib/orders.js';
import { requireAdmin } from '../../_lib/access.js';
import { json } from '../../_lib/http.js';

const VIEWS = {
  paid: "status = 'paid' AND shipped_at IS NULL",
  shipped: "status = 'paid' AND shipped_at IS NOT NULL",
  pending: "status = 'pending'",
  all: '1 = 1'
};

async function guard(request, env) {
  if (!isConfigured(env)) return json({ error: 'Orders are not set up yet.' }, 503);
  const admin = await requireAdmin(request, env);
  if (admin.error) return json({ error: admin.error }, admin.status);
  await ensureSchema(env.DB);
  return null;
}

export async function onRequestGet({ request, env }) {
  const denied = await guard(request, env);
  if (denied) return denied;

  const view = new URL(request.url).searchParams.get('status') || 'paid';
  const where = VIEWS[view] || VIEWS.paid;
  const { results } = await env.DB.prepare(`SELECT * FROM orders WHERE ${where} ORDER BY created_at DESC LIMIT 200`).all();
  return json({
    orders: results.map((order) => Object.assign({}, order, { items: JSON.parse(order.items) }))
  });
}

export async function onRequestPost({ request, env }) {
  const denied = await guard(request, env);
  if (denied) return denied;

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: 'Invalid request.' }, 400);
  }
  const now = new Date().toISOString();
  const updates = {
    printed: ['UPDATE orders SET printed_at = ? WHERE id = ?', now],
    shipped: ['UPDATE orders SET shipped_at = ? WHERE id = ?', now],
    unshipped: ['UPDATE orders SET shipped_at = ? WHERE id = ?', null]
  };
  const update = updates[body && body.action];
  if (!update || typeof body.id !== 'string') return json({ error: 'Invalid request.' }, 400);

  await env.DB.prepare(update[0]).bind(update[1], body.id).run();
  return json({ ok: true });
}
