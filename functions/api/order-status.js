/*
 * GET /api/order-status?order=CP261021-7K3Q
 * Used by the thank-you page. If the callback has not arrived yet, asks CHIP directly.
 * Returns no personal details.
 */
import { ensureSchema, isConfigured, applyPaidPurchase } from '../_lib/orders.js';
import { getPurchase } from '../_lib/chip.js';
import { json } from '../_lib/http.js';

export async function onRequestGet({ request, env }) {
  const id = new URL(request.url).searchParams.get('order') || '';
  if (!/^CP\d{6}-[A-Z0-9]{4}$/.test(id)) return json({ error: 'Order not found.' }, 404);
  if (!isConfigured(env)) return json({ error: 'Not available.' }, 503);

  await ensureSchema(env.DB);
  const order = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first();
  if (!order) return json({ error: 'Order not found.' }, 404);

  let status = order.status;
  if (status === 'pending' && order.chip_purchase_id) {
    try {
      const purchase = await getPurchase(env, order.chip_purchase_id);
      if (await applyPaidPurchase(env, order, purchase)) status = 'paid';
    } catch (error) {
      console.error(error);
    }
  }
  return json({ order: order.id, status, total: order.total });
}
