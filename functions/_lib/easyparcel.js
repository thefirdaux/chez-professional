/*
 * EasyParcel Open API (2026-09): courier prices, booking (paid from EasyParcel credit), AWB and tracking.
 * https://easyparcel.github.io/OpenAPI/
 *
 * The shop connects once with OAuth: the admin presses "Connect EasyParcel", signs in to the
 * client's EasyParcel account, and the tokens are kept in D1 (table settings) and refreshed here.
 *
 * Settings (Cloudflare Pages → Settings → Variables and secrets), from the EasyParcel Developer Hub app:
 *   EASYPARCEL_CLIENT_ID      Text
 *   EASYPARCEL_CLIENT_SECRET  Secret
 *   EASYPARCEL_DEMO           Text "1" where the connection is an EasyParcel sandbox (Preview):
 *                             allows test orders and keeps its tokens apart from the live ones
 * The app's Redirect URI must be <site>/api/easyparcel-callback.
 */
import { weights, packagingWeight, parcelSize } from '../../products.js';
import { nationalNumber } from './orders.js';

const API = 'https://api.easyparcel.com';
const OPEN_API = API + '/open_api/2026-09/';

// Where couriers collect parcels (same sender as the A5 labels in admin/admin.js)
export const SHIP_FROM = {
  name: 'Chez Professional',
  phone: '1159500464', // 011-5950 0464 without the leading 0, as the API wants
  address1: 'No. 2, Lorong 3/27C, Seksyen 5',
  address2: 'Wangsa Maju',
  city: 'Kuala Lumpur',
  state: 'MY-14',
  postcode: '53300'
};

// Checkout state names (products.js) → ISO 3166-2 codes used by the API
const STATE_CODES = {
  'Johor': 'MY-01', 'Kedah': 'MY-02', 'Kelantan': 'MY-03', 'Melaka': 'MY-04', 'Negeri Sembilan': 'MY-05',
  'Pahang': 'MY-06', 'Pulau Pinang': 'MY-07', 'Perak': 'MY-08', 'Perlis': 'MY-09', 'Selangor': 'MY-10',
  'Terengganu': 'MY-11', 'Sabah': 'MY-12', 'Sarawak': 'MY-13', 'W.P. Kuala Lumpur': 'MY-14',
  'W.P. Labuan': 'MY-15', 'W.P. Putrajaya': 'MY-16',
  // Brunei districts
  'Brunei-Muara': 'BN-BM', 'Belait': 'BN-BE', 'Tutong': 'BN-TU', 'Temburong': 'BN-TE'
};

// Customs code for hair care products, needed for parcels leaving Malaysia
const HS_CODE = '330590';

export const MAX_WEIGHT = 30;
// Signing in can need a verification code from the account owner, so allow some time
const STATE_MAX_AGE_MS = 30 * 60 * 1000;

export class EasyParcelError extends Error {}
export class NotConnectedError extends EasyParcelError {
  constructor() { super('EasyParcel is not connected. Press "Connect EasyParcel" first.'); }
}

export function easyParcelReady(env) {
  return Boolean(env.EASYPARCEL_CLIENT_ID && env.EASYPARCEL_CLIENT_SECRET);
}

export function isDemo(env) {
  return env.EASYPARCEL_DEMO === '1' || env.EASYPARCEL_DEMO === 'true';
}

/** Parcel weight in kg for an order's items, rounded up to 10 g. */
export function parcelWeight(items) {
  const total = items.reduce((sum, line) => sum + (weights[line.id] || 0) * line.qty, packagingWeight);
  return Math.ceil(total * 100 - 1e-9) / 100;
}

/** Receiver's country and state/district code (Singapore has no subdivision). */
function destinationOf(order) {
  const country = order.country || 'MY';
  if (country === 'SG') return { country, subdivision: undefined };
  const code = STATE_CODES[order.state];
  if (!code) throw new EasyParcelError('Unknown state "' + order.state + '".');
  return { country, subdivision: code };
}

const sen = (ringgit) => Math.round(Number(ringgit) * 100);

/** "Best Global Logistics Technology (Malaysia) Sdn. Bhd." → "Best Global Logistics Technology" */
export function shortCourierName(name) {
  return String(name || '')
    .replace(/\s*\((Malaysia|M)\)/gi, '')
    .replace(/\s+(Sdn\.?\s*Bhd\.?|Berhad|Bhd\.?)(?=\s|$|\))/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/* ---------- Saved settings (tokens, sign-in state) ---------- */
const tokenKey = (env) => 'easyparcel_token_' + (isDemo(env) ? 'sandbox' : 'live');
const stateKey = (env) => 'easyparcel_state_' + (isDemo(env) ? 'sandbox' : 'live');

async function getSetting(db, key) {
  const row = await db.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first();
  return row ? JSON.parse(row.value) : null;
}

function putSetting(db, key, value) {
  return db.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at')
    .bind(key, JSON.stringify(value), new Date().toISOString())
    .run();
}

function deleteSetting(db, key) {
  return db.prepare('DELETE FROM settings WHERE key = ?').bind(key).run();
}

/* ---------- OAuth ---------- */
function randomToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** EasyParcel sign-in page; `state` is remembered so only a sign-in started from the admin is accepted. */
export async function authorizeUrl(env, redirectUri) {
  const state = randomToken();
  await putSetting(env.DB, stateKey(env), { state, at: Date.now() });
  const params = new URLSearchParams({ client_id: env.EASYPARCEL_CLIENT_ID, redirect_uri: redirectUri, response_type: 'code', state });
  return API + '/oauth/login?' + params;
}

function postToken(env, params, asJson) {
  return fetch(API + '/oauth/token', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + btoa(env.EASYPARCEL_CLIENT_ID + ':' + env.EASYPARCEL_CLIENT_SECRET),
      'Content-Type': asJson ? 'application/json' : 'application/x-www-form-urlencoded',
      Accept: 'application/json'
    },
    body: asJson ? JSON.stringify(params) : new URLSearchParams(params)
  });
}

async function tokenRequest(env, params) {
  let res = await postToken(env, params, false);
  let body = await res.json().catch(() => ({}));
  // The docs don't say how the body is encoded; standard OAuth is a form, so try JSON only if that's refused
  if (!res.ok && (res.status === 400 || res.status === 415 || res.status === 422)) {
    const retry = await postToken(env, params, true);
    const retryBody = await retry.json().catch(() => ({}));
    if (retry.ok && retryBody.access_token) {
      res = retry;
      body = retryBody;
    }
  }
  if (!res.ok || !body.access_token) {
    const error = new EasyParcelError('EasyParcel sign-in failed: ' + (body.error_description || body.message || body.error || 'status ' + res.status) + '.');
    error.status = res.status;
    throw error;
  }
  return {
    access: body.access_token,
    refresh: body.refresh_token || params.refresh_token,
    expiresAt: Date.now() + (Number(body.expires_in) || 3600) * 1000
  };
}

/** Finishes the sign-in: checks the state, swaps the code for tokens and saves them. */
export async function finishConnect(env, { code, state, redirectUri }) {
  const saved = await getSetting(env.DB, stateKey(env));
  await deleteSetting(env.DB, stateKey(env));
  if (!saved || !state || saved.state !== state || Date.now() - saved.at > STATE_MAX_AGE_MS) {
    throw new EasyParcelError('This EasyParcel sign-in link has expired. Please press "Connect EasyParcel" again.');
  }
  if (!code) throw new EasyParcelError('EasyParcel did not allow the connection.');
  const token = await tokenRequest(env, { grant_type: 'authorization_code', code, redirect_uri: redirectUri, state });
  await putSetting(env.DB, tokenKey(env), Object.assign(token, { redirectUri, connectedAt: new Date().toISOString() }));
}

export async function disconnect(env) {
  await deleteSetting(env.DB, tokenKey(env));
}

async function accessToken(env) {
  const saved = await getSetting(env.DB, tokenKey(env));
  if (!saved) throw new NotConnectedError();
  if (saved.expiresAt - 60 * 1000 > Date.now()) return saved.access;
  let token;
  try {
    token = await tokenRequest(env, { grant_type: 'refresh_token', refresh_token: saved.refresh, redirect_uri: saved.redirectUri });
  } catch (error) {
    // Another request may have refreshed it a moment ago (refresh tokens can only be used once)
    const latest = await getSetting(env.DB, tokenKey(env));
    if (latest && latest.access !== saved.access && latest.expiresAt - 60 * 1000 > Date.now()) return latest.access;
    // A refused refresh token (expired, unused for 30 days, or access removed) needs a new sign-in
    if (error.status === 400 || error.status === 401) {
      await disconnect(env);
      throw new NotConnectedError();
    }
    throw error;
  }
  await putSetting(env.DB, tokenKey(env), Object.assign({}, saved, token));
  return token.access;
}

/* ---------- API calls ---------- */
async function call(env, path, body) {
  const token = await accessToken(env);
  const res = await fetch(OPEN_API + path, {
    method: body ? 'POST' : 'GET',
    headers: Object.assign({ Authorization: 'Bearer ' + token, Accept: 'application/json' }, body ? { 'Content-Type': 'application/json' } : {}),
    body: body ? JSON.stringify(body) : undefined
  });
  if (res.status === 401) {
    await disconnect(env);
    throw new NotConnectedError();
  }
  const data = await res.json().catch(() => null);
  if (!res.ok || !data) {
    throw new EasyParcelError('EasyParcel: ' + ((data && (errorText(data) || data.message)) || 'request failed (' + res.status + ').'));
  }
  return data;
}

/** Joins the error messages of a failed batch entry. */
function errorText(entry) {
  if (!entry) return '';
  const errors = Array.isArray(entry.errors) ? entry.errors : entry.errors ? [entry.errors] : [];
  const messages = [];
  errors.forEach(function collect(error) {
    if (typeof error === 'string') messages.push(error);
    else if (Array.isArray(error)) error.forEach(collect);
    else if (error && typeof error === 'object') {
      if (error.message) messages.push(String(error.message));
      else Object.values(error).forEach(collect);
    }
  });
  return messages.join(' ') || (entry.status === 'error' && entry.message ? String(entry.message) : '');
}

function size(weight) {
  return { weight, length: parcelSize.length, width: parcelSize.width, height: parcelSize.height };
}

/** Courier services for this order's address, cheapest first. */
export async function quote(env, order, weight) {
  const to = destinationOf(order);
  const data = await call(env, 'shipment/quotations', {
    shipment: [Object.assign({
      sender: { postcode: SHIP_FROM.postcode, subdivision_code: SHIP_FROM.state, country: 'MY' },
      receiver: { postcode: order.postcode, subdivision_code: to.subdivision, country: to.country },
      parcel_value: order.subtotal / 100
    }, size(weight))]
  });
  const result = Array.isArray(data.data) ? data.data[0] : null;
  if (!result || result.status !== 'success') {
    throw new EasyParcelError('EasyParcel: ' + (errorText(result) || 'no couriers found for this address.'));
  }
  return (result.quotations || [])
    .map((q) => {
      const courier = q.courier || {};
      const pricing = q.pricing || {};
      return {
        serviceId: String(courier.service_id || ''),
        courier: shortCourierName(courier.courier_name),
        service: courier.service_name || '',
        detail: courier.is_pickup && courier.is_dropoff ? 'dropoff/pickup' : courier.is_pickup ? 'pickup' : courier.is_dropoff ? 'dropoff' : '',
        delivery: courier.delivery_duration ? String(courier.delivery_duration) : '',
        price: sen(pricing.total_amount)
      };
    })
    .filter((rate) => rate.serviceId && Number.isFinite(rate.price))
    .sort((a, b) => a.price - b.price);
}

function shipmentResult(shipment) {
  const formats = shipment.awb_urls_by_format || {};
  return {
    shipmentNo: String(shipment.shipment_number || ''),
    awb: shipment.awb_number ? String(shipment.awb_number) : '',
    // The client prints on an A5 printer, so prefer the A5 airway bill
    awbLink: formats.A5 || shipment.awb_url || formats.A6 || formats.A4 || '',
    trackingUrl: shipment.tracking_url || ''
  };
}

/** Books the courier. EasyParcel takes the payment from the account's credit straight away. */
export async function book(env, order, { serviceId, weight, collectDate }) {
  const value = order.subtotal / 100;
  const to = destinationOf(order);
  const item = { content: 'Hair care products', currency_code: 'MYR', value, quantity: 1 };
  if (to.country !== 'MY') item.hs_code = HS_CODE;
  const data = await call(env, 'shipment/submit_orders', {
    shipment: [Object.assign({
      reference: order.id,
      service_id: serviceId,
      collection_date: collectDate,
      item: [Object.assign(item, size(weight))],
      sender: {
        name: SHIP_FROM.name, phone_number_country_code: 'MY', phone_number: SHIP_FROM.phone,
        address_1: SHIP_FROM.address1, address_2: SHIP_FROM.address2, postcode: SHIP_FROM.postcode,
        city: SHIP_FROM.city, subdivision_code: SHIP_FROM.state, country_code: 'MY'
      },
      receiver: {
        name: order.name, phone_number_country_code: to.country, phone_number: nationalNumber(order.phone, to.country), email: order.email,
        address_1: order.address1, address_2: order.address2 || undefined, postcode: order.postcode,
        city: order.city, subdivision_code: to.subdivision, country_code: to.country
      },
      feature: { email_tracking: true }
    }, size(weight))]
  });
  const result = Array.isArray(data.data) ? data.data[0] : null;
  const shipment = result && Array.isArray(result.shipments) ? result.shipments[0] : null;
  if (!shipment || shipment.status === 'error' || result.status === 'error') {
    const message = errorText(shipment) || errorText(result) || 'could not book the courier.';
    throw new EasyParcelError(/credit|balance|insufficient/i.test(message)
      ? 'Not enough EasyParcel credit. Top up in EasyParcel, then book again.'
      : 'EasyParcel: ' + message);
  }
  const pricing = result.pricing_breakdown || {};
  return Object.assign(shipmentResult(shipment), {
    courier: typeof shipment.courier === 'string' ? shipment.courier : (shipment.courier && shipment.courier.courier_name) || '',
    price: sen(pricing.total_paid_amount != null ? pricing.total_paid_amount : pricing.total_order_amount)
  });
}

/** Fetches the AWB and links again, for couriers that issue the AWB a little after booking. */
export async function details(env, shipmentNo) {
  const data = await call(env, 'shipment/details', { shipment_number: shipmentNo });
  const result = Array.isArray(data.data) ? data.data[0] : data.data;
  if (!result) throw new EasyParcelError('EasyParcel could not find shipment ' + shipmentNo + '.');
  return shipmentResult(Object.assign({ shipment_number: result.shipment_number }, result.shipment_details || result));
}

/** Latest courier status for an AWB number. */
export async function track(env, awb) {
  const data = await call(env, 'shipment/tracking_status', { awb_numbers: [awb] });
  const result = data.data && Array.isArray(data.data.results) ? data.data.results[0] : null;
  if (!result || result.status === 'not_found' || !result.latest_tracking_status) return 'No update from the courier yet';
  return result.latest_tracking_status + (result.latest_event_date ? ' (' + result.latest_event_date + ')' : '');
}

/** Credit left in the connected EasyParcel account, in sen. */
export async function balance(env) {
  const data = await call(env, 'wallet');
  const wallet = data.data && Array.isArray(data.data.wallet) ? data.data.wallet[0] : null;
  return wallet ? sen(wallet.balance) : null;
}
