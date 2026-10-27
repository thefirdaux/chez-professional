/*
 * EasyParcel Individual API (v1.4): courier prices, booking, payment (AWB) and tracking.
 * https://developers.easyparcel.com/?pg=DocAPI&c=Malaysia&type=Individual
 *
 * Settings (Cloudflare Pages → Settings → Variables and secrets):
 *   EASYPARCEL_API_KEY  Secret, from EasyParcel → Integrations → API (Individual API)
 *   EASYPARCEL_DEMO     Text "1" to use EasyParcel's demo server, where nothing is really shipped
 *
 * Shipments are paid from the client's EasyParcel credit, never from the buyer's payment.
 */
import { weights, packagingWeight } from '../../products.js';

const LIVE_URL = 'https://connect.easyparcel.my/';
const DEMO_URL = 'https://demo.connect.easyparcel.my/';

// Where couriers collect parcels (same sender as the A5 labels in admin/admin.js)
export const SHIP_FROM = {
  name: 'Chez Professional',
  contact: '01159500464',
  addr1: 'No. 2, Lorong 3/27C, Seksyen 5',
  addr2: 'Wangsa Maju',
  city: 'Kuala Lumpur',
  state: 'kul',
  code: '53300'
};

// Checkout state names (products.js) → EasyParcel state codes (API appendix III)
const STATE_CODES = {
  'Johor': 'jhr', 'Kedah': 'kdh', 'Kelantan': 'ktn', 'Melaka': 'mlk', 'Negeri Sembilan': 'nsn',
  'Pahang': 'phg', 'Perak': 'prk', 'Perlis': 'pls', 'Pulau Pinang': 'png', 'Selangor': 'sgr',
  'Terengganu': 'trg', 'W.P. Kuala Lumpur': 'kul', 'W.P. Putrajaya': 'pjy', 'Sabah': 'sbh',
  'Sarawak': 'srw', 'W.P. Labuan': 'lbn'
};

export const MAX_WEIGHT = 30;

export class EasyParcelError extends Error {}

export function easyParcelReady(env) {
  return Boolean(env.EASYPARCEL_API_KEY);
}

export function isDemo(env) {
  return env.EASYPARCEL_DEMO === '1' || env.EASYPARCEL_DEMO === 'true';
}

/** Parcel weight in kg for an order's items, rounded up to 10 g. */
export function parcelWeight(items) {
  const total = items.reduce((sum, line) => sum + (weights[line.id] || 0) * line.qty, packagingWeight);
  return Math.ceil(total * 100 - 1e-9) / 100;
}

/** "+60123456789" / "60123456789" / "0123456789" → "0123456789" */
export function localPhone(phone) {
  return String(phone || '').replace(/^\+/, '').replace(/^60/, '0');
}

/** Splits an address into at most 4 lines of 35 characters (the API's limit), breaking between words. */
export function addressLines(...parts) {
  const words = parts.filter(Boolean).join(', ').split(/\s+/).filter(Boolean);
  const lines = [''];
  for (const word of words) {
    const current = lines[lines.length - 1];
    if (!current) lines[lines.length - 1] = word.slice(0, 35);
    else if ((current + ' ' + word).length <= 35) lines[lines.length - 1] = current + ' ' + word;
    else lines.push(word.slice(0, 35));
  }
  if (lines.length > 4) lines.splice(3, lines.length - 3, lines.slice(3).join(' ').slice(0, 35));
  return lines;
}

// PHP-style form fields, e.g. bulk[0][weight]=1.2
function formBody(data) {
  const params = new URLSearchParams();
  (function add(name, value) {
    if (value === undefined || value === null) return;
    if (typeof value === 'object') {
      for (const key of Object.keys(value)) add(name ? `${name}[${key}]` : key, value[key]);
    } else {
      params.append(name, typeof value === 'boolean' ? (value ? '1' : '0') : String(value));
    }
  })('', data);
  return params;
}

async function call(env, action, data) {
  const res = await fetch((isDemo(env) ? DEMO_URL : LIVE_URL) + '?ac=' + action, {
    method: 'POST',
    body: formBody(Object.assign({ api: env.EASYPARCEL_API_KEY }, data))
  });
  let body;
  try {
    body = await res.json();
  } catch (e) {
    throw new EasyParcelError('EasyParcel did not answer properly (' + res.status + '). Please try again.');
  }
  if (body.api_status !== 'Success') throw new EasyParcelError('EasyParcel: ' + (body.error_remark || 'request refused.'));
  return Array.isArray(body.result) ? body.result[0] : null;
}

function stateCode(state) {
  const code = STATE_CODES[state];
  if (!code) throw new EasyParcelError('Unknown state "' + state + '".');
  return code;
}

const sen = (ringgit) => Math.round(Number(ringgit) * 100);

/** Courier services for this order's address, cheapest first. */
export async function quote(env, order, weight) {
  const result = await call(env, 'EPRateCheckingBulk', {
    bulk: [{
      pick_code: SHIP_FROM.code, pick_state: SHIP_FROM.state, pick_country: 'MY',
      send_code: order.postcode, send_state: stateCode(order.state), send_country: 'MY',
      weight
    }],
    exclude_fields: ['rates.*.dropoff_point', 'rates.*.pickup_point', 'pgeon_point']
  });
  if (!result || result.status !== 'Success') {
    throw new EasyParcelError('EasyParcel: ' + ((result && result.remarks) || 'no couriers found for this address.'));
  }
  return (result.rates || [])
    // Pgeon point-to-point services need a chosen point, which this admin doesn't offer
    .filter((rate) => rate.service_id && Number.isFinite(sen(rate.price)) && !/pgeon/i.test(rate.courier_name + ' ' + rate.service_name))
    .map((rate) => ({
      serviceId: String(rate.service_id),
      courier: rate.courier_name || '',
      service: rate.service_name || '',
      detail: rate.service_detail || '',
      delivery: rate.delivery || '',
      pickupDate: rate.pickup_date || '',
      price: sen(rate.price)
    }))
    .sort((a, b) => a.price - b.price);
}

/** Creates the shipment in EasyParcel (not paid yet). */
export async function submit(env, order, { serviceId, weight, collectDate }) {
  const from = addressLines(SHIP_FROM.addr1, SHIP_FROM.addr2);
  const to = addressLines(order.address1, order.address2);
  const result = await call(env, 'EPSubmitOrderBulk', {
    bulk: [{
      weight,
      content: 'Hair care products',
      value: (order.subtotal / 100).toFixed(2),
      service_id: serviceId,
      pick_name: SHIP_FROM.name, pick_contact: SHIP_FROM.contact,
      pick_addr1: from[0], pick_addr2: from[1], pick_addr3: from[2], pick_addr4: from[3],
      pick_city: SHIP_FROM.city, pick_state: SHIP_FROM.state, pick_code: SHIP_FROM.code, pick_country: 'MY',
      send_name: String(order.name).slice(0, 35), send_contact: localPhone(order.phone),
      send_addr1: to[0], send_addr2: to[1], send_addr3: to[2], send_addr4: to[3],
      send_city: String(order.city).slice(0, 35), send_state: stateCode(order.state), send_code: order.postcode, send_country: 'MY',
      collect_date: collectDate,
      sms: false,
      send_email: order.email,
      REQ_ID: order.id,
      reference: order.id
    }]
  });
  if (!result || result.status !== 'Success' || !result.order_number) {
    throw new EasyParcelError('EasyParcel: ' + ((result && result.remarks) || 'could not create the shipment.'));
  }
  return { orderNo: String(result.order_number), courier: result.courier || '', price: sen(result.price) };
}

/** Pays for a created shipment from EasyParcel credit. The AWB can come a little later for some couriers. */
export async function pay(env, orderNo) {
  const result = await call(env, 'EPPayOrderBulk', { bulk: [{ order_no: orderNo }] });
  const message = (result && result.messagenow) || '';
  const parcel = result && Array.isArray(result.parcel) ? result.parcel[0] : null;
  if (/insufficient/i.test(message)) {
    throw new EasyParcelError('Not enough EasyParcel credit. Top up in EasyParcel, then press Pay again.');
  }
  if (!parcel && !/paid/i.test(message)) {
    throw new EasyParcelError('EasyParcel: ' + (message || 'payment did not go through.'));
  }
  return {
    awb: (parcel && parcel.awb) || '',
    awbLink: (parcel && parcel.awb_id_link) || '',
    trackingUrl: (parcel && parcel.tracking_url) || ''
  };
}

/** Latest courier status for an AWB number. */
export async function track(env, awb) {
  const result = await call(env, 'EPTrackingBulk', { bulk: [{ awb_no: awb }] });
  const status = result && result.latest_status ? String(result.latest_status) : 'No update from the courier yet';
  return result && result.latest_update ? status + ' (' + result.latest_update + ')' : status;
}
