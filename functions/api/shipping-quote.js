/*
 * POST /api/shipping-quote
 * Body: { items: [{ id, qty }], destination: { country, postcode, state } }
 * The postage the buyer will pay, shown at checkout before paying. /api/checkout works it out
 * again itself, so this answer is only for display.
 */
import { InputError, readDestination, MAX_QTY } from '../_lib/orders.js';
import { products } from '../../products.js';
import { postageFor } from '../_lib/postage.js';
import { json } from '../_lib/http.js';

export async function onRequestPost({ request, env }) {
  // Only the shop's own checkout page may ask (each answer costs an EasyParcel request)
  if (request.headers.get('Origin') !== new URL(request.url).origin) return json({ error: 'Request blocked.' }, 403);

  let input;
  try {
    input = await request.json();
  } catch (e) {
    return json({ error: 'Invalid request.' }, 400);
  }

  const items = [];
  let subtotal = 0;
  for (const line of Array.isArray(input && input.items) ? input.items.slice(0, 20) : []) {
    const id = line && typeof line.id === 'string' ? line.id : '';
    const qty = Number(line && line.qty);
    if (!Object.prototype.hasOwnProperty.call(products, id) || !Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) continue;
    items.push({ id, qty });
    subtotal += products[id].price * qty;
  }
  if (!items.length) return json({ error: 'Your cart is empty.' }, 400);

  let destination;
  try {
    destination = readDestination((input && input.destination) || {});
  } catch (error) {
    if (error instanceof InputError) return json({ error: error.message }, 400);
    throw error;
  }

  const postage = await postageFor(env, destination, items, subtotal);
  return json({ fee: postage.fee, cost: postage.cost, covered: postage.covered, label: postage.label, live: postage.live });
}
