/*
 * Product catalogue: the one place to change names, prices and descriptions.
 * Prices are in sen (RM 42.90 = 4290). `was` is the crossed-out original price, or null:
 * the price before the November 2026 change, as the client gave it.
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

var AQUA = {
  eyebrow: 'AQUA BASE',
  description: 'Water-based styling with a strong hold that keeps your hairstyle neat and well-defined, and washes out easily with water.',
  highlights: ['Strong hold for a neat, well-defined look', 'Water-based formula for everyday use', 'Easy to rinse: washes out with water']
};

function product(name, size, price, was, info, extra) {
  var p = { name: name, size: size, price: price, was: was, eyebrow: info.eyebrow, description: info.description, highlights: info.highlights };
  for (var key in extra) p[key] = extra[key];
  return p;
}

var products = {
  'shampoo-1': product('Keratin Treatment Shampoo', '280ml x 1 bottle', 4200, 6200, SHAMPOO),
  'shampoo-3': product('Keratin Treatment Shampoo', '280ml x 3 bottle', 12500, 18600, SHAMPOO),
  'mask-1': product('Keratin Treatment Mask', '280ml x 1 bottle', 4200, 6500, MASK),
  'mask-3': product('Keratin Treatment Mask', '280ml x 3 bottle', 12500, 19500, MASK),
  'spray-1': product('Keratin Spray Leave In', '135ml x 1 bottle', 3900, 5200, SPRAY),
  'spray-3': product('Keratin Spray Leave In', '135ml x 3 bottle', 11600, 15600, SPRAY),
  'tonic-1': product('Root Booster Hair Tonic', '135ml x 1 bottle', 3900, 5800, TONIC),
  'tonic-3': product('Root Booster Hair Tonic', '135ml x 3 bottle', 11600, 17400, TONIC),
  'aqua-1': product('Aqua Base Styling Hydration', '1 jar', 3000, null, AQUA),
  'keratin-set': product('Keratin Treatment Set', '280ml x 2 + 135ml x 1 bottle', 12200, 17900, {
    eyebrow: 'KERATIN TREATMENT SET',
    description: 'The complete keratin routine: the Keratin Treatment Shampoo and Mask to cleanse and repair, then the Keratin Spray Leave In for lasting moisture, heat protection and easier styling.',
    highlights: ['No SLS. No Paraben. Gentle on hair and scalp', 'Keratin Treatment Shampoo 280ml', 'Keratin Treatment Mask 280ml', 'Keratin Spray Leave In 135ml']
  }, { combo: true }),
  'scalp-set': product('Scalp Treatment Set', '280ml x 2 + 135ml x 1 bottle', 12200, 18500, {
    eyebrow: 'SCALP TREATMENT SET',
    description: 'Care for your hair and scalp together: the Keratin Treatment Shampoo and Mask for softer, stronger hair, plus the Root Booster Hair Tonic with ginseng, biotin and menthol to nourish the roots.',
    highlights: ['No SLS. No Paraben. Gentle on hair and scalp', 'Keratin Treatment Shampoo 280ml', 'Keratin Treatment Mask 280ml', 'Root Booster Hair Tonic 135ml']
  }, { combo: true })
};

// Which products appear in each shop grid on the home page, in order
var shops = {
  keratin: ['shampoo-1', 'shampoo-3', 'mask-1', 'mask-3'],
  spray: ['spray-1', 'spray-3'],
  tonic: ['tonic-1', 'tonic-3'],
  aqua: ['aqua-1'],
  combos: ['keratin-set', 'scalp-set']
};

// Postage in sen. The buyer pays EasyParcel's cheapest courier rate for their address, less
// `covered` (what the shop pays towards it; nothing since 23 November 2026, it was RM4 in Malaysia). `fallback` is the estimated postage within Malaysia,
// used only when EasyParcel can't be reached so checkout keeps working. Abroad there is no
// estimate: the buyer is asked to try again in a few minutes.
var shipping = {
  covered: { MY: 0, SG: 0, BN: 0 },
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
var BUNDLE = { weight: 1.5, box: [15, 15, 10] };
var parcels = {
  'shampoo-1': SINGLE, 'mask-1': SINGLE, 'spray-1': SINGLE, 'tonic-1': SINGLE, 'aqua-1': SINGLE,
  'shampoo-3': BUNDLE, 'mask-3': BUNDLE, 'spray-3': BUNDLE, 'tonic-3': BUNDLE,
  // Three bottles, so packed like a bundle until the client gives the real size
  'keratin-set': BUNDLE, 'scalp-set': BUNDLE
};

// Voucher codes buyers can type at checkout (any letter case), in sen. The discount comes off
// the products only, never off postage or the payment fee. No minimum spend, usable on every order.
var vouchers = { HELLOCHEZ: 300 };

/** The discount in sen a voucher code gives on this product subtotal, or 0 if the code is unknown. */
function voucherDiscount(code, subtotal) {
  var key = String(code || '').trim().toUpperCase();
  return Object.prototype.hasOwnProperty.call(vouchers, key) ? Math.min(vouchers[key], subtotal) : 0;
}

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

export { products, shops, shipping, paymentFee, states, countries, districts, config, formatRM, parcels, voucherDiscount };

if (typeof window !== 'undefined') {
  window.CHEZ = { products: products, shops: shops, shipping: shipping, paymentFee: paymentFee, states: states, countries: countries, districts: districts, config: config, formatRM: formatRM, voucherDiscount: voucherDiscount };
}
