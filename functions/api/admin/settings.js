/*
 * GET /api/admin/settings  (signed-in admin only)
 * What the Settings page shows: the CHIP payment setup (and the payment methods CHIP has
 * switched on), whether EasyParcel is set up, and the postage rules from products.js.
 * EasyParcel's live connection and credit come from /api/admin/shipping { action: 'status' }.
 */
import { isConfigured } from '../../_lib/orders.js';
import { requireAdmin } from '../../_lib/access.js';
import { json } from '../../_lib/http.js';
import { paymentMethods } from '../../_lib/chip.js';
import { easyParcelReady, isDemo, SHIP_FROM } from '../../_lib/easyparcel.js';
import { shipping, countries } from '../../../products.js';

function masked(id) {
  return id && id.length > 12 ? id.slice(0, 8) + '…' + id.slice(-4) : id || '';
}

export async function onRequestGet({ request, env }) {
  if (!isConfigured(env)) return json({ error: 'Orders are not set up yet.' }, 503);
  const admin = await requireAdmin(request, env);
  if (admin.error) return json({ error: admin.error }, admin.status);

  let methods = null;
  try {
    methods = (await paymentMethods(env)).map((method) => method.name);
  } catch (error) {
    console.error(error.message);
  }

  return json({
    chip: { connected: true, testMode: env.CHIP_TEST_MODE === '1', brand: masked(env.CHIP_BRAND_ID), methods },
    easyparcel: {
      configured: easyParcelReady(env),
      demo: isDemo(env),
      shipFrom: [SHIP_FROM.address1, SHIP_FROM.address2, SHIP_FROM.postcode + ' ' + SHIP_FROM.city].join(', ')
    },
    postage: { covered: shipping.covered, fallback: shipping.fallback, countries: countries.filter((c) => c[3]).map((c) => c[1]) }
  });
}
