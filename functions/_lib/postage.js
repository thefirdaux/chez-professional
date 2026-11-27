/*
 * Postage for an order. Within Malaysia the buyer pays the flat fee in shipping.flat (products.js),
 * one per order; EasyParcel is still asked, for the courier to book (J&T first, see easyparcel.quote)
 * and what it will cost the shop. Singapore and Brunei pay EasyParcel's rate; if EasyParcel can't be
 * reached, postageFor throws PostageUnavailable and the buyer is asked to try again.
 */
import { shipping, states } from '../../products.js';
import * as easyparcel from './easyparcel.js';

const NAMES = { MY: 'Malaysia', SG: 'Singapore', BN: 'Brunei' };

export class PostageUnavailable extends Error {
  constructor(country) {
    super('We can\'t work out the shipping fee to ' + NAMES[country] + ' right now. Please try again in a few minutes.');
  }
}

function flatFee(destination) {
  const state = states.filter((s) => s[0] === destination.state)[0];
  return shipping.flat[state && state[1] === 'east' ? 'east' : 'west'];
}

/**
 * destination: { country, postcode, state } (already checked by readDestination)
 * Returns { fee, cost, serviceId, courier, label, live }; amounts in sen. `fee` is what the buyer
 * pays, `cost` what the courier charges the shop (the flat fee when EasyParcel couldn't be asked).
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
  const domestic = destination.country === 'MY';
  if (!live && !domestic) throw new PostageUnavailable(destination.country);
  const fee = domestic ? flatFee(destination) : cost;
  if (!live) cost = fee;
  const where = domestic ? destination.state : NAMES[destination.country];
  return {
    fee,
    cost,
    serviceId: rate ? rate.serviceId : null,
    courier: rate ? rate.courier : '',
    label: 'Delivery to ' + where + (rate && rate.courier ? ' by ' + rate.courier : ''),
    live
  };
}
