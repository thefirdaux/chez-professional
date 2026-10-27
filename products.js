/*
 * Product catalogue: the one place to change names, prices and descriptions.
 * Prices are in sen (RM 42.90 = 4290). `was` is the crossed-out original price, or null.
 *
 * This file is shared: the browser uses it to show prices, and the order server
 * (functions/api/checkout.js) imports the same file to calculate what the buyer pays.
 * The server never trusts prices sent from the browser.
 */
var SHAMPOO = {
  eyebrow: 'KERATIN SHAMPOO & MASK',
  description: 'Designed to nourish and care for your hair, this formula helps boost hydration, improve hair structure, and reduce stiffness caused by seawater buildup.',
  highlights: ['No SLS. No Paraben. Gentle on hair and scalp', 'Boosts hydration', 'Improves hair structure', 'Reduces stiffness caused by seawater buildup']
};
var MASK = {
  eyebrow: 'KERATIN SHAMPOO & MASK',
  description: 'Deeply moisturizes dry, brittle hair for softer, healthier strands. Replenishes keratin protein to repair damage from bleaching, coloring, and heat styling. Strengthens each strand to reduce breakage and split ends while smoothing frizz and tangles for easier styling.',
  highlights: ['No SLS. No Paraben. Gentle on hair and scalp', 'Deeply moisturizes dry, brittle hair', 'Replenishes keratin protein', 'Reduces breakage and split ends', 'Smooths frizz and tangles']
};
var SPRAY = {
  eyebrow: 'KERATIN SPRAY',
  description: 'Enhance hair manageability with lasting moisture, heat protection, and added keratin. Leaves your hair softer, healthier, and easier to style.',
  highlights: ['Better control and manageability', 'Extra moisture for your hair', 'Protects from the heat of hair dryers and irons', 'Enriched with keratin protein']
};
var TONIC = {
  eyebrow: 'HAIR TONIC',
  description: 'Powered by ingredients like ginseng, biotin, and menthol to help nourish hair roots, invigorate the scalp, and support healthy hair growth.',
  highlights: ['With ginseng, biotin and menthol', 'Nourishes hair roots', 'Invigorates the scalp', 'Keeps your scalp fresh all day, even under your hijab']
};

function product(name, size, price, was, info, extra) {
  var p = { name: name, size: size, price: price, was: was, eyebrow: info.eyebrow, description: info.description, highlights: info.highlights };
  for (var key in extra) p[key] = extra[key];
  return p;
}

var products = {
  'shampoo-1': product('Keratin Treatment Shampoo', '280ml x 1 bottle', 4290, null, SHAMPOO),
  'shampoo-3': product('Keratin Treatment Shampoo', '280ml x 3 bottle', 12000, 12870, SHAMPOO),
  'mask-1': product('Keratin Treatment Mask', '280ml x 1 bottle', 4290, null, MASK),
  'mask-3': product('Keratin Treatment Mask', '280ml x 3 bottle', 12000, 12870, MASK),
  'shampoo-mask-combo': product('Keratin Treatment Shampoo + Mask (Combo)', '280ml x 2 bottle', 8000, 8580, {
    eyebrow: 'KERATIN SHAMPOO & MASK',
    description: 'Get both the Keratin Treatment Shampoo and the Keratin Treatment Mask, 280ml each, for a complete keratin care routine.',
    highlights: ['No SLS. No Paraben. Gentle on hair and scalp', 'Keratin Treatment Shampoo 280ml', 'Keratin Treatment Mask 280ml']
  }, { combo: true }),
  'spray-1': product('Keratin Spray Leave In', '135ml x 1 bottle', 3990, null, SPRAY),
  'spray-3': product('Keratin Spray Leave In', '135ml x 3 bottle', 11000, 11970, SPRAY),
  'tonic-1': product('Root Booster Hair Tonic', '135ml x 1 bottle', 3990, null, TONIC),
  'tonic-3': product('Root Booster Hair Tonic', '135ml x 3 bottle', 11000, 11970, TONIC),
  'spray-tonic-combo': product('Leave In Keratin Spray + Root Booster Hair Tonic (Combo)', '135ml x 2 bottle', 7500, 7980, {
    eyebrow: 'KERATIN SPRAY + HAIR TONIC',
    description: 'Get both the Keratin Spray Leave In and the Root Booster Hair Tonic, 135ml each, to care for your hair and scalp.',
    highlights: ['Keratin Spray Leave In 135ml', 'Root Booster Hair Tonic 135ml']
  }, { combo: true })
};

// Which products appear in each shop grid on the home page, in order
var shops = {
  keratin: ['shampoo-1', 'shampoo-3', 'mask-1', 'mask-3', 'shampoo-mask-combo'],
  spray: ['spray-1', 'spray-3'],
  tonic: ['tonic-1', 'tonic-3'],
  combos: ['shampoo-mask-combo', 'spray-tonic-combo']
};

// Postage in sen. The buyer pays EasyParcel's cheapest courier rate for their address, less
// `covered` (what the shop pays towards it). `fallback` is the estimated postage within Malaysia,
// used only when EasyParcel can't be reached so checkout keeps working. Abroad there is no
// estimate: the buyer is asked to try again in a few minutes.
var shipping = {
  covered: { MY: 400, SG: 0, BN: 0 },
  fallback: { west: 800, east: 1500 }
};

// Countries the shop delivers to: code, name, phone country code, open for orders.
// Singapore and Brunei stay closed until CHIP card payments are approved, because FPX and
// DuitNow QR only work with Malaysian banks. Set the last value to true to open them.
var countries = [['MY', 'Malaysia', '60', true], ['SG', 'Singapore', '65', false], ['BN', 'Brunei', '673', false]];

// Brunei districts (Singapore has none)
var districts = ['Brunei-Muara', 'Belait', 'Tutong', 'Temburong'];

// Each product as the client packs it, used to price and book couriers through EasyParcel:
// weight in kg (packaging included) and box size in cm, length x width x height.
// The admin can still change the weight before booking.
var SINGLE = { weight: 0.5, box: [15, 10, 5] };
var COMBO = { weight: 1, box: [15, 10, 10] };
var BUNDLE = { weight: 1.5, box: [15, 15, 10] };
var parcels = {
  'shampoo-1': SINGLE, 'mask-1': SINGLE, 'spray-1': SINGLE, 'tonic-1': SINGLE,
  'shampoo-mask-combo': COMBO, 'spray-tonic-combo': COMBO,
  'shampoo-3': BUNDLE, 'mask-3': BUNDLE, 'spray-3': BUNDLE, 'tonic-3': BUNDLE
};

// Payment processing fee in sen, listed as its own line on every order.
// RM1.00 matches CHIP's FPX charge.
var paymentFee = { label: 'Payment processing fee', fee: 100 };

var states = [
  ['Johor', 'west'], ['Kedah', 'west'], ['Kelantan', 'west'], ['Melaka', 'west'],
  ['Negeri Sembilan', 'west'], ['Pahang', 'west'], ['Perak', 'west'], ['Perlis', 'west'],
  ['Pulau Pinang', 'west'], ['Selangor', 'west'], ['Terengganu', 'west'],
  ['W.P. Kuala Lumpur', 'west'], ['W.P. Putrajaya', 'west'],
  ['Sabah', 'east'], ['Sarawak', 'east'], ['W.P. Labuan', 'east']
];

// Checkout asks the order server at this path whether online payment is switched on.
// Until the CHIP keys are added in Cloudflare (or on hosts without the server), it runs in demo mode.
var config = { orderApi: '/api' };

function formatRM(sen) {
  return 'RM ' + (sen / 100).toFixed(2);
}

export { products, shops, shipping, paymentFee, states, countries, districts, config, formatRM, parcels };

if (typeof window !== 'undefined') {
  window.CHEZ = { products: products, shops: shops, shipping: shipping, paymentFee: paymentFee, states: states, countries: countries, districts: districts, config: config, formatRM: formatRM };
}
