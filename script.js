(function () {
  var button = document.querySelector('.site-header__menu');
  var nav = document.getElementById('site-nav');
  if (!button || !nav || button.disabled) return;

  function setOpen(open) {
    nav.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    button.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  }

  button.addEventListener('click', function () {
    setOpen(nav.hidden);
  });

  nav.addEventListener('click', function (event) {
    if (event.target.closest('a')) setOpen(false);
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && !nav.hidden) {
      setOpen(false);
      button.focus();
    }
  });

  document.addEventListener('click', function (event) {
    if (!nav.hidden && !event.target.closest('.site-header')) setOpen(false);
  });
})();

/* ---------- Product bottom sheet ---------- */
(function () {
  // Paste each CHIP payment link into payUrl. An empty payUrl keeps "Pay Now" disabled.
  // Name, size and price come from the product card on the page, so they are only set in index.html.
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

  var PRODUCTS = {
    'shampoo-1': { info: SHAMPOO, payUrl: '' },
    'shampoo-3': { info: SHAMPOO, payUrl: '' },
    'mask-1': { info: MASK, payUrl: '' },
    'mask-3': { info: MASK, payUrl: '' },
    'shampoo-mask-combo': {
      info: {
        eyebrow: 'KERATIN SHAMPOO & MASK',
        description: 'Get both the Keratin Treatment Shampoo and the Keratin Treatment Mask, 280ml each, for a complete keratin care routine.',
        highlights: SHAMPOO.highlights.slice(0, 1).concat(['Keratin Treatment Shampoo 280ml', 'Keratin Treatment Mask 280ml'])
      },
      payUrl: ''
    },
    'spray-1': { info: SPRAY, payUrl: '' },
    'spray-3': { info: SPRAY, payUrl: '' },
    'tonic-1': { info: TONIC, payUrl: '' },
    'tonic-3': { info: TONIC, payUrl: '' },
    'spray-tonic-combo': {
      info: {
        eyebrow: 'KERATIN SPRAY + HAIR TONIC',
        description: 'Get both the Keratin Spray Leave In and the Root Booster Hair Tonic, 135ml each, to care for your hair and scalp.',
        highlights: ['Keratin Spray Leave In 135ml', 'Root Booster Hair Tonic 135ml']
      },
      payUrl: ''
    }
  };

  var sheet = document.getElementById('product-sheet');
  if (!sheet || typeof sheet.showModal !== 'function') return;

  var field = function (name) { return sheet.querySelector('[data-field="' + name + '"]'); };
  var image = sheet.querySelector('.sheet__image');
  var pay = sheet.querySelector('.sheet__pay');
  var lastTrigger = null;

  function fill(id, card) {
    var product = PRODUCTS[id];
    var price = card.querySelector('.shop-card__price');
    var sale = price.querySelector('s');

    image.src = 'assets/products/large/' + id + '.png';
    image.alt = card.querySelector('.shop-card__image').alt;
    field('eyebrow').textContent = product.info.eyebrow;
    field('name').textContent = card.querySelector('.shop-card__name h4').textContent;
    field('size').textContent = card.querySelector('.shop-card__name p').textContent;
    field('was').textContent = sale ? sale.textContent : '';
    field('price').textContent = sale ? price.querySelector('span').textContent : price.textContent;
    field('price').classList.toggle('is-sale', !!sale);
    field('description').textContent = product.info.description;

    var list = field('highlights');
    list.textContent = '';
    product.info.highlights.forEach(function (text) {
      var li = document.createElement('li');
      li.textContent = text;
      list.appendChild(li);
    });

    if (product.payUrl) {
      pay.href = product.payUrl;
      pay.removeAttribute('aria-disabled');
    } else {
      pay.href = '#';
      pay.setAttribute('aria-disabled', 'true');
    }
  }

  function open(id, card, trigger) {
    fill(id, card);
    lastTrigger = trigger;
    sheet.querySelector('.sheet__panel').scrollTop = 0;
    document.documentElement.classList.add('is-sheet-open');
    sheet.showModal();
  }

  function close() {
    if (!sheet.open || sheet.classList.contains('is-closing')) return;
    sheet.classList.add('is-closing');
    var done = function () {
      sheet.classList.remove('is-closing');
      sheet.close();
    };
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) done();
    else setTimeout(done, 200);
  }

  document.querySelectorAll('.shop-card__buy[data-product]').forEach(function (button) {
    button.addEventListener('click', function () {
      open(button.dataset.product, button.closest('.shop-card'), button);
    });
  });

  sheet.addEventListener('close', function () {
    document.documentElement.classList.remove('is-sheet-open');
    if (lastTrigger) lastTrigger.focus({ preventScroll: true });
  });

  // Esc: animate out instead of closing instantly
  sheet.addEventListener('cancel', function (event) {
    event.preventDefault();
    close();
  });

  sheet.querySelector('.sheet__close').addEventListener('click', close);

  // Tapping the dimmed backdrop (the dialog itself, outside the panel) closes the sheet
  sheet.addEventListener('click', function (event) {
    if (event.target === sheet) close();
  });

  pay.addEventListener('click', function (event) {
    if (pay.getAttribute('aria-disabled') === 'true') event.preventDefault();
  });
})();
