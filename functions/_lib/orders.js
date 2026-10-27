/*
 * Order rules shared by the checkout, callback and admin endpoints.
 * Prices and shipping always come from products.js, never from the browser.
 */
import { products, paymentFee, states, countries, districts } from '../../products.js';

export const MAX_QTY = 20;
const MAX_LINES = 20;

export class InputError extends Error {}

function text(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export function normalizePhone(value) {
  return text(value, 30).replace(/[\s()-]/g, '');
}

// Mobile numbers per country, after the country code (and Malaysia's leading 0) is removed
const PHONES = {
  MY: { code: '60', pattern: /^1\d{8,9}$/, error: 'Please enter a valid Malaysian mobile number.' },
  SG: { code: '65', pattern: /^[3689]\d{7}$/, error: 'Please enter a valid Singapore phone number (8 digits).' },
  BN: { code: '673', pattern: /^[2-8]\d{6}$/, error: 'Please enter a valid Brunei phone number (7 digits).' }
};

/** The number without its country code, e.g. "+60 12-345 6789" → "123456789". */
export function nationalNumber(phone, country = 'MY') {
  const code = PHONES[country] ? PHONES[country].code : '60';
  let digits = normalizePhone(phone).replace(/^\+/, '');
  if (digits.startsWith(code) && digits.length > code.length + 6) digits = digits.slice(code.length);
  return country === 'MY' ? digits.replace(/^0/, '') : digits;
}

// CHIP wants "<country code> <number>", e.g. "+60 123456789"
export function chipPhone(phone, country = 'MY') {
  return '+' + (PHONES[country] ? PHONES[country].code : '60') + ' ' + nationalNumber(phone, country);
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

  const customer = readCustomer((input && input.customer) || {});

  const items = [];
  let subtotal = 0;
  for (const [id, qty] of merged) {
    const p = products[id];
    items.push({ id, name: p.name, size: p.size, qty, price: p.price });
    subtotal += p.price * qty;
  }
  // Postage is added by the caller (see _lib/postage.js), because it comes from EasyParcel
  return { items, customer, subtotal, fee: paymentFee.fee, feeLabel: paymentFee.label };
}

/** Checks the delivery address only (used to quote postage before the rest is filled in). */
export function readDestination(c) {
  const country = countries.some((x) => x[0] === c.country) ? c.country : (c.country ? null : 'MY');
  if (!country) throw new InputError('We deliver to Malaysia, Singapore and Brunei only.');
  const postcode = text(c.postcode, 12).toUpperCase().replace(/\s/g, '');
  let state = text(c.state, 40);
  if (country === 'MY') {
    if (!/^\d{5}$/.test(postcode)) throw new InputError('Please enter a 5-digit postcode.');
    if (!states.some((s) => s[0] === state)) throw new InputError('Please select your state.');
  } else if (country === 'SG') {
    if (!/^\d{6}$/.test(postcode)) throw new InputError('Please enter a 6-digit postal code.');
    state = '';
  } else {
    if (!/^[A-Z]{2}\d{4}$/.test(postcode)) throw new InputError('Please enter a postcode like BS8811.');
    if (!districts.includes(state)) throw new InputError('Please select your district.');
  }
  return { country, postcode, state };
}

function readCustomer(c) {
  const destination = readDestination(c);
  const customer = Object.assign({
    name: text(c.name, 80),
    phone: normalizePhone(c.phone),
    email: text(c.email, 120),
    address1: text(c.address1, 120),
    address2: text(c.address2, 120),
    city: text(c.city, 60) || (destination.country === 'SG' ? 'Singapore' : '')
  }, destination);
  if (customer.name.length < 2) throw new InputError('Please enter your full name.');
  const phone = PHONES[customer.country];
  if (!phone.pattern.test(nationalNumber(customer.phone, customer.country))) throw new InputError(phone.error);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) throw new InputError('Please enter a valid email.');
  if (!customer.address1) throw new InputError('Please enter your address.');
  if (!customer.city) throw new InputError('Please enter your city.');
  // Numbers outside Malaysia are kept with their country code, so they can be dialled as shown
  if (customer.country !== 'MY') customer.phone = '+' + phone.code + nationalNumber(customer.phone, customer.country);
  return customer;
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

const LATER_COLUMNS = [
  'fee INTEGER NOT NULL DEFAULT 0',
  'country TEXT', 'ship_cost INTEGER', 'ship_service TEXT', 'ship_courier TEXT',
  // EasyParcel shipment (see _lib/easyparcel.js)
  'ep_order_no TEXT', 'ep_courier TEXT', 'ep_price INTEGER', 'ep_paid_at TEXT',
  'ep_awb TEXT', 'ep_awb_link TEXT', 'ep_tracking_url TEXT', 'ep_status TEXT', 'ep_lock INTEGER'
];

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
      db.prepare('CREATE INDEX IF NOT EXISTS orders_status ON orders (status, created_at)'),
      db.prepare('CREATE TABLE IF NOT EXISTS login_failures (ip TEXT NOT NULL, at INTEGER NOT NULL)'),
      db.prepare('CREATE INDEX IF NOT EXISTS login_failures_at ON login_failures (at)'),
      db.prepare(`CREATE TABLE IF NOT EXISTS page_views (
        at INTEGER NOT NULL,
        day TEXT NOT NULL,
        path TEXT NOT NULL,
        source TEXT NOT NULL,
        device TEXT NOT NULL,
        visitor TEXT NOT NULL
      )`),
      db.prepare('CREATE INDEX IF NOT EXISTS page_views_day ON page_views (day)'),
      db.prepare('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)')
    ]).then(async () => {
      // Columns added after the table was first created
      for (const column of LATER_COLUMNS) {
        await db.prepare('ALTER TABLE orders ADD COLUMN ' + column).run().catch((error) => {
          if (!/duplicate column/i.test(String(error && error.message))) throw error;
        });
      }
    }).catch((error) => {
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
