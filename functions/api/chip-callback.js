/*
 * POST /api/chip-callback (CHIP success_callback)
 * Only trusted after the X-Signature check; then the order is marked paid if the amount matches.
 */
import { ensureSchema, isConfigured, applyPaidPurchase } from '../_lib/orders.js';
import { verifySignature } from '../_lib/chip.js';

export async function onRequestPost({ request, env }) {
  if (!isConfigured(env)) return new Response('Not configured', { status: 503 });

  const raw = await request.arrayBuffer();
  const valid = await verifySignature(env, raw, request.headers.get('X-Signature'));
  if (!valid) return new Response('Invalid signature', { status: 401 });

  let purchase;
  try {
    purchase = JSON.parse(new TextDecoder().decode(raw));
  } catch (e) {
    return new Response('Invalid body', { status: 400 });
  }

  await ensureSchema(env.DB);
  const order = await env.DB.prepare('SELECT * FROM orders WHERE chip_purchase_id = ?').bind(purchase.id).first();
  // Unknown purchases are acknowledged so CHIP stops retrying; there is nothing to update.
  if (!order) return new Response('OK');

  if (purchase.status === 'paid') {
    const applied = await applyPaidPurchase(env, order, purchase);
    if (!applied) console.error('Paid callback did not match order', order.id, purchase.id);
  }
  return new Response('OK');
}
