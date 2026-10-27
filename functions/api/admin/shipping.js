/*
 * POST /api/admin/shipping  (signed-in admin only), body { id, action, ... }
 *   quote  { weight? }                          courier prices for the order, cheapest first
 *   book   { serviceId, weight, collectDate? }  creates the EasyParcel shipment and pays for it
 *   pay    {}                                   pays for a shipment created earlier (e.g. after a top-up)
 *   track  {}                                   latest courier status
 * See _lib/easyparcel.js for the settings it needs.
 */
import { ensureSchema, isConfigured } from '../../_lib/orders.js';
import { requireAdmin } from '../../_lib/access.js';
import { json } from '../../_lib/http.js';
import { malaysiaDay } from '../../_lib/visits.js';
import * as easyparcel from '../../_lib/easyparcel.js';

const LOCK_MS = 60 * 1000;

function readWeight(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const weight = Math.round(Number(value) * 100) / 100;
  return weight > 0 && weight <= easyparcel.MAX_WEIGHT ? weight : null;
}

async function payAndSave(env, order) {
  const paid = await easyparcel.pay(env, order.ep_order_no);
  await env.DB.prepare('UPDATE orders SET ep_paid_at = ?, ep_awb = ?, ep_awb_link = ?, ep_tracking_url = ? WHERE id = ?')
    .bind(new Date().toISOString(), paid.awb, paid.awbLink, paid.trackingUrl, order.id)
    .run();
  return paid;
}

export async function onRequestPost({ request, env }) {
  if (!isConfigured(env)) return json({ error: 'Orders are not set up yet.' }, 503);
  const admin = await requireAdmin(request, env);
  if (admin.error) return json({ error: admin.error }, admin.status);
  if (!easyparcel.easyParcelReady(env)) return json({ error: 'EasyParcel is not connected yet.' }, 503);
  await ensureSchema(env.DB);

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: 'Invalid request.' }, 400);
  }
  if (!body || typeof body.id !== 'string') return json({ error: 'Invalid request.' }, 400);

  const order = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(body.id).first();
  if (!order) return json({ error: 'Order not found.' }, 404);
  if (order.status !== 'paid') return json({ error: 'Only paid orders can be shipped.' }, 400);
  // A test payment must never spend real EasyParcel credit
  if (order.is_test && !easyparcel.isDemo(env)) return json({ error: 'This is a test order, so it cannot be booked with a real courier.' }, 400);

  try {
    if (body.action === 'quote') {
      const weight = readWeight(body.weight, easyparcel.parcelWeight(JSON.parse(order.items)));
      if (!weight) return json({ error: 'Please enter a weight between 0.01 and ' + easyparcel.MAX_WEIGHT + ' kg.' }, 400);
      return json({ weight, rates: await easyparcel.quote(env, order, weight), demo: easyparcel.isDemo(env) });
    }

    if (body.action === 'book') {
      const weight = readWeight(body.weight, null);
      if (!weight) return json({ error: 'Please enter a weight between 0.01 and ' + easyparcel.MAX_WEIGHT + ' kg.' }, 400);
      if (typeof body.serviceId !== 'string' || !/^[\w-]{1,20}$/.test(body.serviceId)) return json({ error: 'Please choose a courier.' }, 400);
      const today = malaysiaDay(Date.now());
      const collectDate = typeof body.collectDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.collectDate) && body.collectDate >= today
        ? body.collectDate : today;

      // Only one booking per order, even if the button is pressed twice
      const now = Date.now();
      const lock = await env.DB.prepare('UPDATE orders SET ep_lock = ? WHERE id = ? AND ep_order_no IS NULL AND (ep_lock IS NULL OR ep_lock < ?)')
        .bind(now, order.id, now - LOCK_MS)
        .run();
      if (!lock.meta || lock.meta.changes !== 1) return json({ error: 'This order is already booked or being booked.' }, 409);

      let shipment;
      try {
        shipment = await easyparcel.submit(env, order, { serviceId: body.serviceId, weight, collectDate });
      } catch (error) {
        await env.DB.prepare('UPDATE orders SET ep_lock = NULL WHERE id = ?').bind(order.id).run();
        throw error;
      }
      await env.DB.prepare('UPDATE orders SET ep_order_no = ?, ep_courier = ?, ep_price = ?, ep_lock = NULL WHERE id = ?')
        .bind(shipment.orderNo, shipment.courier, shipment.price, order.id)
        .run();
      order.ep_order_no = shipment.orderNo;
      return json(Object.assign({ ok: true }, shipment, await payAndSave(env, order)));
    }

    if (body.action === 'pay') {
      if (!order.ep_order_no) return json({ error: 'Book a courier first.' }, 400);
      if (order.ep_paid_at) return json({ error: 'This shipment is already paid.' }, 409);
      return json(Object.assign({ ok: true }, await payAndSave(env, order)));
    }

    if (body.action === 'track') {
      if (!order.ep_awb) return json({ error: 'There is no tracking number yet.' }, 400);
      const status = await easyparcel.track(env, order.ep_awb);
      await env.DB.prepare('UPDATE orders SET ep_status = ? WHERE id = ?').bind(status.slice(0, 200), order.id).run();
      return json({ ok: true, status });
    }
  } catch (error) {
    if (error instanceof easyparcel.EasyParcelError) return json({ error: error.message }, 502);
    throw error;
  }

  return json({ error: 'Invalid request.' }, 400);
}
