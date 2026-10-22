/*
 * Order rules shared by the checkout, callback and admin endpoints.
 * Prices and shipping always come from products.js, never from the browser.
 */
import { products, shipping, paymentFee, states } from '../../products.js';

export const MAX_QTY = 20;
const MAX_LINES = 20;

export class InputError extends Error {}

function text(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export function normalizePhone(value) {
  return text(value, 30).replace(/[\s-]/g, '');
}

// CHIP wants "<country code> <number>", e.g. "+60 123456789"
export function chipPhone(phone) {
  const digits = phone.replace(/^\+?60/, '').replace(/^0/, '');
  return '+60 ' + digits;
}

/** Validates the checkout request and prices it from the official catalogue. */
export function priceOrder(input) {
  const rawItems = Array.isArray(input && input.items) ? input.items : [];
  if (rawItems.length === 0 || rawItems.length > MAX_LINES) throw new InputError('Your cart is empty.');

  const merged = new Map();
  for (const item of rawItems) {
    const id = item && typeof item.id === 'string' ? item.id : '';
    const qty = Number(item && item.qty);
    if (!Object.prototype.hasOwnProperty.call(products, id)) throw new InputError('Unknown product.');
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) throw new InputError('Invalid quantity.');
    merged.set(id, Math.min(MAX_QTY, (merged.get(id) || 0) + qty));
  }

  const c = (input && input.customer) || {};
  const customer = {
    name: text(c.name, 80),
    phone: normalizePhone(c.phone),
    email: text(c.email, 120),
    address1: text(c.address1, 120),
    address2: text(c.address2, 120),
    postcode: text(c.postcode, 5),
    city: text(c.city, 60),
    state: text(c.state, 40)
  };
  if (customer.name.length < 2) throw new InputError('Please enter your full name.');
  if (!/^(\+?60|0)1\d{8,9}$/.test(customer.phone)) throw new InputError('Please enter a valid Malaysian mobile number.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) throw new InputError('Please enter a valid email.');
  if (!customer.address1) throw new InputError('Please enter your address.');
  if (!/^\d{5}$/.test(customer.postcode)) throw new InputError('Please enter a 5-digit postcode.');
  if (!customer.city) throw new InputError('Please enter your city.');
  const state = states.filter((s) => s[0] === customer.state)[0];
  if (!state) throw new InputError('Please select your state.');

  const items = [];
  let subtotal = 0;
  for (const [id, qty] of merged) {
    const p = products[id];
    items.push({ id, name: p.name, size: p.size, qty, price: p.price });
    subtotal += p.price * qty;
  }
  const ship = shipping[state[1]];
  return {
    items, customer, subtotal,
    shipping: ship.fee, shippingLabel: ship.label,
    fee: paymentFee.fee, feeLabel: paymentFee.label,
    total: subtotal + ship.fee + paymentFee.fee
  };
}

/** Order numbers like CP261021-7K3Q: date plus 4 random characters. */
export function newOrderId(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const date = String(now.getUTCFullYear()).slice(2) + pad(now.getUTCMonth() + 1) + pad(now.getUTCDate());
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  let suffix = '';
  for (const b of bytes) suffix += alphabet[b % alphabet.length];
  return 'CP' + date + '-' + suffix;
}

let schemaReady = null;

/** Creates the orders table on first use, so no separate migration step is needed. */
export function ensureSchema(db) {
  if (!schemaReady) {
    schemaReady = db.batch([
      db.prepare(`CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        status TEXT NOT NULL,
        chip_purchase_id TEXT,
        items TEXT NOT NULL,
        subtotal INTEGER NOT NULL,
        shipping INTEGER NOT NULL,
        fee INTEGER NOT NULL DEFAULT 0,
        total INTEGER NOT NULL,
        name TEXT, phone TEXT, email TEXT,
        address1 TEXT, address2 TEXT, postcode TEXT, city TEXT, state TEXT,
        is_test INTEGER,
        paid_at TEXT, printed_at TEXT, shipped_at TEXT
      )`),
      db.prepare('CREATE INDEX IF NOT EXISTS orders_chip ON orders (chip_purchase_id)'),
      db.prepare('CREATE INDEX IF NOT EXISTS orders_status ON orders (status, created_at)')
    ]).then(() =>
      // Tables created before the payment fee existed get the column here
      db.prepare('ALTER TABLE orders ADD COLUMN fee INTEGER NOT NULL DEFAULT 0').run().catch((error) => {
        if (!/duplicate column/i.test(String(error && error.message))) throw error;
      })
    ).catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
}

/**
 * Marks an order paid if the CHIP purchase really is paid for this order's exact amount.
 * Safe to call more than once (CHIP may resend callbacks).
 */
export async function applyPaidPurchase(env, order, purchase) {
  if (order.status === 'paid') return true;
  const details = purchase.purchase || {};
  const matches =
    purchase.status === 'paid' &&
    purchase.id === order.chip_purchase_id &&
    purchase.reference === order.id &&
    details.currency === 'MYR' &&
    Number(details.total) === Number(order.total) &&
    (!env.CHIP_BRAND_ID || purchase.brand_id === env.CHIP_BRAND_ID);
  if (!matches) return false;
  await env.DB.prepare("UPDATE orders SET status = 'paid', paid_at = ?, is_test = ? WHERE id = ? AND status != 'paid'")
    .bind(new Date().toISOString(), purchase.is_test ? 1 : 0, order.id)
    .run();
  return true;
}

export function isConfigured(env) {
  return Boolean(env.DB && env.CHIP_SECRET_KEY && env.CHIP_BRAND_ID);
}
