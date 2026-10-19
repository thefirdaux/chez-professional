/*
 * Product catalogue: the one place to change names, prices and descriptions.
 * Prices are in sen (RM 42.90 = 4290). `was` is the crossed-out original price, or null.
 *
 * These prices are for display only. When online payment goes live, the order server
 * recalculates every total from its own copy of this list, so a buyer editing prices
 * in their browser cannot change what they pay.
 */
(function () {
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
    'spray-tonic-combo': product('Keratin Spray + Hair Tonic (Combo)', '135ml x 2 bottle', 7500, 7980, {
      eyebrow: 'KERATIN SPRAY + HAIR TONIC',
      description: 'Get both the Keratin Spray Leave In and the Root Booster Hair Tonic, 135ml each, to care for your hair and scalp.',
      highlights: ['Keratin Spray Leave In 135ml', 'Root Booster Hair Tonic 135ml']
    }, { combo: true })
  };

  // Which products appear in each shop grid on the home page, in order
  var shops = {
    keratin: ['shampoo-1', 'shampoo-3', 'mask-1', 'mask-3', 'shampoo-mask-combo'],
    spray: ['spray-1', 'spray-3'],
    tonic: ['tonic-1', 'tonic-3', 'spray-tonic-combo']
  };

  // Shipping in sen. PLACEHOLDER flat rates until EasyParcel live rates are connected:
  // confirm the real rates with the client before taking payments.
  var shipping = {
    west: { label: 'Peninsular Malaysia', fee: 800 },
    east: { label: 'Sabah, Sarawak & Labuan', fee: 1500 }
  };

  var states = [
    ['Johor', 'west'], ['Kedah', 'west'], ['Kelantan', 'west'], ['Melaka', 'west'],
    ['Negeri Sembilan', 'west'], ['Pahang', 'west'], ['Perak', 'west'], ['Perlis', 'west'],
    ['Pulau Pinang', 'west'], ['Selangor', 'west'], ['Terengganu', 'west'],
    ['W.P. Kuala Lumpur', 'west'], ['W.P. Putrajaya', 'west'],
    ['Sabah', 'east'], ['Sarawak', 'east'], ['W.P. Labuan', 'east']
  ];

  // Empty while online payment is not connected: checkout then runs in demo mode.
  var config = { orderApi: '' };

  function formatRM(sen) {
    return 'RM ' + (sen / 100).toFixed(2);
  }

  window.CHEZ = { products: products, shops: shops, shipping: shipping, states: states, config: config, formatRM: formatRM };
})();
