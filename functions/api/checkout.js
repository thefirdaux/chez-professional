/*
 * POST /api/checkout
 * Body: { items: [{ id, qty }], customer: { name, phone, email, address1, address2, postcode, city, state, country } }
 * Prices the order from products.js and postage from EasyParcel (_lib/postage.js), stores it,
 * creates a CHIP purchase and returns its payment page.
 */
import { priceOrder, InputError, newOrderId, ensureSchema, isConfigured, chipPhone } from '../_lib/orders.js';
import { createPurchase } from '../_lib/chip.js';
import { json } from '../_lib/http.js';
import { postageFor, PostageUnavailable } from '../_lib/postage.js';

export async function onRequestPost({ request, env }) {
  if (!isConfigured(env)) return json({ error: 'Online payment is not available yet.' }, 503);

  let input;
  try {
    input = await request.json();
  } catch (e) {
    return json({ error: 'Invalid request.' }, 400);
  }

  let order;
  try {
    order = priceOrder(input);
  } catch (error) {
    if (error instanceof InputError) return json({ error: error.message }, 400);
    throw error;
  }

  await ensureSchema(env.DB);
  const c = order.customer;
  let postage;
  try {
    postage = await postageFor(env, c, order.items, order.subtotal);
  } catch (error) {
    if (error instanceof PostageUnavailable) return json({ error: error.message }, 503);
    throw error;
  }
  order.total = order.subtotal + postage.fee + order.fee;

  const id = newOrderId();
  await env.DB.prepare(
    `INSERT INTO orders (id, created_at, status, items, subtotal, shipping, fee, total,
       name, phone, email, address1, address2, postcode, city, state, country, ship_cost, ship_service, ship_courier)
     VALUES (?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(id, new Date().toISOString(), JSON.stringify(order.items), order.subtotal, postage.fee, order.fee, order.total,
      c.name, c.phone, c.email, c.address1, c.address2, c.postcode, c.city, c.state,
      c.country, postage.cost, postage.serviceId, postage.courier)
    .run();

  const origin = new URL(request.url).origin;
  const street = [c.address1, c.address2].filter(Boolean).join(', ').slice(0, 128);

  try {
    const purchase = await createPurchase(env, {
      brand_id: env.CHIP_BRAND_ID,
      reference: id,
      send_receipt: true,
      creator_agent: 'chezprofessional-web',
      client: {
        email: c.email,
        phone: chipPhone(c.phone, c.country),
        full_name: c.name,
        street_address: street,
        city: c.city,
        zip_code: c.postcode,
        state: c.state,
        country: c.country,
        shipping_street_address: street,
        shipping_city: c.city,
        shipping_zip_code: c.postcode,
        shipping_state: c.state,
        shipping_country: c.country
      },
      purchase: {
        currency: 'MYR',
        language: 'en',
        products: order.items
          .map((item) => ({ name: item.name + ' (' + item.size + ')', quantity: String(item.qty), price: item.price }))
          .concat([
            { name: 'Shipping (' + postage.label + ')', quantity: '1', price: postage.fee },
            { name: order.feeLabel, quantity: '1', price: order.fee }
          ])
      },
      success_redirect: origin + '/order-success?order=' + id,
      failure_redirect: origin + '/checkout?payment=failed',
      cancel_redirect: origin + '/checkout?payment=cancelled',
      success_callback: origin + '/api/chip-callback'
    });
    await env.DB.prepare('UPDATE orders SET chip_purchase_id = ? WHERE id = ?').bind(purchase.id, id).run();
    return json({ orderId: id, checkoutUrl: purchase.checkout_url, total: order.total, shipping: postage.fee });
  } catch (error) {
    console.error(error);
    await env.DB.prepare("UPDATE orders SET status = 'failed' WHERE id = ?").bind(id).run();
    return json({ error: 'Could not start the payment. Please try again.' }, 502);
  }
}
