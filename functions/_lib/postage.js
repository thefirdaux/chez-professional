/*
 * Postage for an order: EasyParcel's cheapest courier for the address, less the part the shop
 * covers (shipping.covered in products.js). If EasyParcel can't be reached or isn't connected,
 * Malaysian addresses use the estimates in shipping.fallback; Singapore and Brunei can't be
 * estimated, so postageFor throws PostageUnavailable and the buyer is asked to try again.
 */
import { shipping, states } from '../../products.js';
import * as easyparcel from './easyparcel.js';

const NAMES = { MY: 'Malaysia', SG: 'Singapore', BN: 'Brunei' };

export class PostageUnavailable extends Error {
  constructor(country) {
    super('We can\'t work out the shipping fee to ' + NAMES[country] + ' right now. Please try again in a few minutes.');
  }
}

function fallbackCost(destination) {
  if (destination.country !== 'MY') throw new PostageUnavailable(destination.country);
  const state = states.filter((s) => s[0] === destination.state)[0];
  return shipping.fallback[state && state[1] === 'east' ? 'east' : 'west'];
}

/**
 * destination: { country, postcode, state } (already checked by readDestination)
 * Returns { fee, cost, covered, serviceId, courier, label, live }; amounts in sen.
 */
export async function postageFor(env, destination, items, subtotal) {
  let cost = null;
  let rate = null;
  if (easyparcel.easyParcelReady(env) && env.DB) {
    try {
      const rates = await easyparcel.quote(env, Object.assign({ subtotal }, destination), easyparcel.parcelWeight(items), easyparcel.parcelBox(items));
      rate = rates[0] || null;
      if (rate) cost = rate.price;
    } catch (error) {
      console.error('Postage quote failed, using the estimate:', error.message);
    }
  }
  const live = cost !== null;
  if (!live) cost = fallbackCost(destination);
  const covered = Math.min(cost, shipping.covered[destination.country] || 0);
  const where = destination.country === 'MY' ? destination.state : NAMES[destination.country];
  return {
    fee: cost - covered,
    cost,
    covered,
    serviceId: rate ? rate.serviceId : null,
    courier: rate ? rate.courier : '',
    label: 'Delivery to ' + where + (rate && rate.courier ? ' by ' + rate.courier : ''),
    live
  };
}
