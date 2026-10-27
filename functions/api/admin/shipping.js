/*
 * POST /api/admin/shipping  (signed-in admin only), body { action, id?, ... }
 *   status      {}                                       is EasyParcel connected, and the credit left
 *   disconnect  {}                                       forgets the EasyParcel sign-in
 *   quote       { id, weight? }                          courier prices for the order, cheapest first
 *   book        { id, serviceId, weight, collectDate? }  books the courier, paid from EasyParcel credit
 *   refresh     { id }                                   fetches the AWB again if it wasn't ready at booking
 *   track       { id }                                   latest courier status
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

function saveShipment(env, id, shipment) {
  return env.DB.prepare('UPDATE orders SET ep_awb = ?, ep_awb_link = ?, ep_tracking_url = ? WHERE id = ?')
    .bind(shipment.awb, shipment.awbLink, shipment.trackingUrl, id)
    .run();
}

async function handle(env, body) {
  if (body.action === 'status') {
    try {
      return json({ connected: true, demo: easyparcel.isDemo(env), balance: await easyparcel.balance(env) });
    } catch (error) {
      if (error instanceof easyparcel.NotConnectedError) return json({ connected: false, demo: easyparcel.isDemo(env) });
      throw error;
    }
  }

  if (body.action === 'disconnect') {
    await easyparcel.disconnect(env);
    return json({ ok: true });
  }

  if (typeof body.id !== 'string') return json({ error: 'Invalid request.' }, 400);
  const order = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(body.id).first();
  if (!order) return json({ error: 'Order not found.' }, 404);
  if (order.status !== 'paid') return json({ error: 'Only paid orders can be shipped.' }, 400);
  // A test payment must never spend real EasyParcel credit
  if (order.is_test && !easyparcel.isDemo(env)) return json({ error: 'This is a test order, so it cannot be booked with a real courier.' }, 400);

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
      shipment = await easyparcel.book(env, order, { serviceId: body.serviceId, weight, collectDate });
    } catch (error) {
      // EasyParcel refused it, so nothing was booked and it can be tried again straight away
      if (error instanceof easyparcel.EasyParcelError) await env.DB.prepare('UPDATE orders SET ep_lock = NULL WHERE id = ?').bind(order.id).run();
      throw error;
    }
    await env.DB.prepare('UPDATE orders SET ep_order_no = ?, ep_courier = ?, ep_price = ?, ep_paid_at = ?, ep_lock = NULL WHERE id = ?')
      .bind(shipment.shipmentNo || 'booked', shipment.courier, shipment.price, new Date().toISOString(), order.id)
      .run();
    await saveShipment(env, order.id, shipment);
    return json(Object.assign({ ok: true }, shipment));
  }

  if (body.action === 'refresh') {
    if (!order.ep_order_no || order.ep_order_no === 'booked') return json({ error: 'Open EasyParcel to find this shipment.' }, 400);
    const shipment = await easyparcel.details(env, order.ep_order_no);
    await saveShipment(env, order.id, shipment);
    return json(Object.assign({ ok: true }, shipment));
  }

  if (body.action === 'track') {
    if (!order.ep_awb) return json({ error: 'There is no tracking number yet.' }, 400);
    const status = await easyparcel.track(env, order.ep_awb);
    await env.DB.prepare('UPDATE orders SET ep_status = ? WHERE id = ?').bind(status.slice(0, 200), order.id).run();
    return json({ ok: true, status });
  }

  return json({ error: 'Invalid request.' }, 400);
}

export async function onRequestPost({ request, env }) {
  if (!isConfigured(env)) return json({ error: 'Orders are not set up yet.' }, 503);
  const admin = await requireAdmin(request, env);
  if (admin.error) return json({ error: admin.error }, admin.status);
  if (!easyparcel.easyParcelReady(env)) return json({ error: 'EasyParcel is not set up yet.' }, 503);
  await ensureSchema(env.DB);

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: 'Invalid request.' }, 400);
  }
  if (!body || typeof body.action !== 'string') return json({ error: 'Invalid request.' }, 400);

  try {
    return await handle(env, body);
  } catch (error) {
    if (error instanceof easyparcel.NotConnectedError) return json({ error: error.message, connect: true }, 409);
    if (error instanceof easyparcel.EasyParcelError) return json({ error: error.message }, 502);
    throw error;
  }
}
