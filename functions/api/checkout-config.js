// Tells the checkout page whether real payments are switched on (CHIP keys and database set up).
import { isConfigured } from '../_lib/orders.js';
import { json } from '../_lib/http.js';

export function onRequestGet({ env }) {
  return json({ enabled: isConfigured(env), testMode: env.CHIP_TEST_MODE === '1' });
}
