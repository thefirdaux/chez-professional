/* ---------- Section addresses, e.g. www.chezprofessional.com/aqua-base ---------- */
// Opening one of these addresses (a copied or shared link) goes straight to that section. While the
// visitor scrolls, the address in the browser bar follows the product section on screen, and is / elsewhere.
// _redirects serves the home page at each of these addresses.
var SECTION_LINKS = ['keratin-shampoo-mask', 'keratin-spray', 'hair-tonic', 'aqua-base', 'combos'];
var linkedSection = (function () {
  var name = location.pathname.replace(/^\/+|\/+$/g, '');
  if (SECTION_LINKS.indexOf(name) === -1) return null;
  var section = document.getElementById(name);
  if (!section || location.hash) return section;

  var moved = false; // stop following the section once the visitor scrolls by themselves
  ['wheel', 'touchstart', 'keydown', 'mousedown'].forEach(function (type) {
    window.addEventListener(type, function () { moved = true; }, { once: true, passive: true });
  });

  // Jump without the page's smooth scrolling: a long smooth scroll (the combos are far down) can be
  // cut short in Safari while pictures load. The header height comes from the page's scroll padding.
  var root = document.documentElement;
  function go() {
    if (moved) return;
    var offset = parseFloat(getComputedStyle(root).scrollPaddingTop) || 0;
    var y = Math.max(0, section.getBoundingClientRect().top + window.pageYOffset - offset);
    if (Math.abs(window.pageYOffset - y) < 2) return;
    var smooth = root.style.scrollBehavior;
    root.style.scrollBehavior = 'auto';
    window.scrollTo(0, y);
    root.style.scrollBehavior = smooth;
  }
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  go();

  // Pictures and fonts can still move the section while they load: keep it in place for a few
  // seconds, until the visitor scrolls themselves
  window.addEventListener('load', go);
  if (window.ResizeObserver) {
    var watcher = new ResizeObserver(go);
    watcher.observe(document.body);
    setTimeout(function () { watcher.disconnect(); }, 4000);
  }
  [300, 1000, 2000].forEach(function (ms) { setTimeout(go, ms); });
  return section;
})();

(function () {
  if (!window.history || !history.replaceState) return;
  var sections = Array.prototype.slice.call(document.querySelectorAll('main > section'));
  if (!sections.length) return;
  var ticking = false;

  function update() {
    ticking = false;
    // The section that covers the line a third of the way down the screen
    var line = window.innerHeight / 3;
    var current = null;
    sections.forEach(function (section) {
      if (section.getBoundingClientRect().top <= line) current = section;
    });
    var path = current && SECTION_LINKS.indexOf(current.id) !== -1 ? '/' + current.id : '/';
    if (path !== location.pathname) history.replaceState(history.state, '', path + location.search);
  }

  window.addEventListener('scroll', function () {
    if (!ticking) { ticking = true; window.requestAnimationFrame(update); }
  }, { passive: true });
  update();
})();

/* ---------- Shop, product sheet and cart ---------- */
(function () {
  var CHEZ = window.CHEZ;
  if (!CHEZ || !CHEZ.cart) return;
  var products = CHEZ.products;
  var cart = CHEZ.cart;
  var rm = CHEZ.formatRM;

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  /** "-32%" for a product with a crossed-out price, or null. Rounded to the nearest whole percent. */
  function discountText(product) {
    if (!product.was || product.was <= product.price) return null;
    return '-' + Math.round((product.was - product.price) / product.was * 100) + '%';
  }

  /** "2.8k terjual di TikTok", with the TikTok mark */
  function soldNode(product, className) {
    var p = el('p', className);
    var icon = el('img');
    icon.src = 'assets/icon-tiktok.svg?v=2c7d9041';
    icon.alt = '';
    icon.width = 14;
    icon.height = 14;
    p.appendChild(icon);
    p.appendChild(document.createTextNode(product.sold + ' terjual di TikTok'));
    return p;
  }

  function priceNode(product, className) {
    var p = el('p', className);
    if (product.was) {
      p.classList.add(className + '--sale');
      p.appendChild(el('s', null, rm(product.was)));
      p.appendChild(document.createTextNode(' '));
      p.appendChild(el('span', null, rm(product.price)));
    } else {
      p.textContent = rm(product.price);
    }
    return p;
  }

  /* --- TikTok sold counts in each section's highlight (beside the bottles, under the title) --- */
  document.querySelectorAll('[data-sold]').forEach(function (node) {
    var product = products[node.dataset.sold];
    if (!product || !product.sold) return;
    var line = soldNode(product, 'sold');
    while (line.firstChild) node.appendChild(line.firstChild);
    node.hidden = false;
  });

  /* --- Shop grids, rendered from products.js --- */
  document.querySelectorAll('[data-shop]').forEach(function (list) {
    var ids = CHEZ.shops[list.dataset.shop];
    ids.forEach(function (id, index) {
      var product = products[id];
      // A card left alone on the last row of the 2-column grid is centred, as in the design
      var alone = ids.length % 2 === 1 && index === ids.length - 1;
      var card = el('li', 'shop-card' + (alone ? ' shop-card--alone' : ''));
      var img = el('img', 'shop-card__image');
      img.src = 'assets/products/' + id + '.png';
      img.srcset = 'assets/products/' + id + '.png 400w, assets/products/large/' + id + '.png 900w';
      img.sizes = '(min-width: 768px) 286px, 45vw';
      img.alt = product.name + ', ' + product.size;
      img.loading = 'lazy';
      var media = el('div', 'shop-card__media');
      media.appendChild(img);
      if (discountText(product)) media.appendChild(el('span', 'discount-badge shop-card__badge', discountText(product)));

      var name = el('div', 'shop-card__name');
      name.appendChild(el('h4', null, product.name));
      name.appendChild(el('p', null, product.size));
      if (product.sold) name.appendChild(soldNode(product, 'shop-card__sold'));
      var details = el('div', 'shop-card__details');
      details.appendChild(name);
      details.appendChild(priceNode(product, 'shop-card__price'));

      var buy = el('button', 'shop-card__buy', 'Beli Sekarang');
      buy.type = 'button';
      buy.dataset.product = id;

      var body = el('div', 'shop-card__body');
      body.appendChild(details);
      body.appendChild(buy);
      card.appendChild(media);
      card.appendChild(body);
      list.appendChild(card);
    });
  });

  /* --- Bottom sheets (shared open/close behaviour) --- */
  function bottomSheet(dialog) {
    if (!dialog || typeof dialog.showModal !== 'function') return null;
    var trigger = null;

    function close() {
      if (!dialog.open || dialog.classList.contains('is-closing')) return;
      dialog.classList.add('is-closing');
      var done = function () {
        dialog.classList.remove('is-closing');
        dialog.close();
      };
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) done();
      else setTimeout(done, 200);
    }

    dialog.addEventListener('close', function () {
      if (!document.querySelector('dialog.sheet[open]')) document.documentElement.classList.remove('is-sheet-open');
      if (trigger && document.contains(trigger)) trigger.focus({ preventScroll: true });
    });
    dialog.addEventListener('cancel', function (event) {
      event.preventDefault();
      close();
    });
    dialog.querySelector('.sheet__close').addEventListener('click', close);
    dialog.addEventListener('click', function (event) {
      if (event.target === dialog) close();
    });

    return {
      open: function (from) {
        trigger = from || null;
        dialog.querySelector('.sheet__panel').scrollTop = 0;
        document.documentElement.classList.add('is-sheet-open');
        dialog.showModal();
      },
      close: close,
      // Close without the slide-out animation, e.g. before opening another sheet
      closeNow: function () { if (dialog.open) dialog.close(); }
    };
  }

  /* --- Toast --- */
  var toast = document.querySelector('.toast');
  var toastTimer;
  function showToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.hidden = false;
    toast.classList.remove('is-visible');
    void toast.offsetWidth; // restart the animation
    toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toast.classList.remove('is-visible');
      toastTimer = setTimeout(function () { toast.hidden = true; }, 250);
    }, 2000);
  }

  /* --- Product sheet --- */
  var productDialog = document.getElementById('product-sheet');
  var productSheet = bottomSheet(productDialog);
  var currentId = null;

  function fillProduct(id) {
    var product = products[id];
    var field = function (name) { return productDialog.querySelector('[data-field="' + name + '"]'); };
    var image = productDialog.querySelector('.sheet__image');
    image.src = 'assets/products/large/' + id + '.png';
    image.alt = product.name + ', ' + product.size;
    field('eyebrow').textContent = product.eyebrow;
    field('name').textContent = product.name;
    field('size').textContent = product.size;
    var sold = field('sold');
    sold.textContent = '';
    if (product.sold) sold.appendChild(soldNode(product, 'sheet__sold-line'));
    sold.hidden = !product.sold;
    field('was').textContent = product.was ? rm(product.was) : '';
    field('price').textContent = rm(product.price);
    field('price').classList.toggle('is-sale', !!product.was);
    field('discount').textContent = discountText(product) || '';
    field('description').textContent = product.description;
    var list = field('highlights');
    list.textContent = '';
    product.highlights.forEach(function (text) { list.appendChild(el('li', null, text)); });
  }

  if (productSheet) {
    document.addEventListener('click', function (event) {
      var button = event.target.closest('.shop-card__buy[data-product]');
      if (!button) return;
      currentId = button.dataset.product;
      fillProduct(currentId);
      productSheet.open(button);
    });

    productDialog.querySelector('.sheet__add').addEventListener('click', function () {
      cart.add(currentId, 1);
      productSheet.close();
      showToast('Ditambah ke troli');
    });

    productDialog.querySelector('.sheet__buy').addEventListener('click', function () {
      cart.add(currentId, 1);
      window.location.href = 'checkout.html';
    });
  }

  /* --- Cart sheet --- */
  var cartDialog = document.getElementById('cart-sheet');
  var cartSheet = bottomSheet(cartDialog);

  function renderCart() {
    if (!cartDialog) return;
    cartDialog.classList.toggle('is-empty', cart.count() === 0);
    cart.renderList(cartDialog.querySelector('[data-cart-items]'));
    cartDialog.querySelector('[data-cart-subtotal]').textContent = rm(cart.subtotal());
  }

  document.addEventListener('cart:change', renderCart);
  renderCart();

  var cartButton = document.querySelector('.site-header__cart');
  if (cartSheet && cartButton) {
    cartButton.addEventListener('click', function () {
      renderCart();
      cartSheet.open(cartButton);
    });
  }

  /* --- Combo deals popup: every time the home page opens, after a few seconds --- */
  (function () {
    var promo = document.getElementById('combo-promo');
    var deals = promo && promo.querySelector('[data-promo-deals]');
    if (!promo || !deals || typeof promo.showModal !== 'function') return;

    // Prices come from products.js, so the popup always matches the shop
    (CHEZ.shops.combos || []).forEach(function (id) {
      var p = products[id];
      if (!p) return;
      var li = el('li', 'promo__deal');
      var photo = el('img', 'promo__deal-image');
      photo.src = 'assets/products/' + id + '.png';
      photo.alt = '';
      photo.width = 72;
      photo.height = 72;
      li.appendChild(photo);
      var info = el('span', 'promo__deal-info');
      info.appendChild(el('span', 'promo__deal-name', p.name.replace(/\s*\(Combo\)$/, '')));
      var price = el('span', 'promo__deal-price', rm(p.price));
      if (p.was) {
        price.insertBefore(el('s', '', rm(p.was)), price.firstChild);
        var save = el('span', 'promo__deal-save', 'Jimat ' + rm(p.was - p.price) + ' ');
        save.appendChild(el('span', 'discount-badge', discountText(p)));
        price.appendChild(save);
      }
      info.appendChild(price);
      li.appendChild(info);
      deals.appendChild(li);
    });

    function close() {
      if (!promo.open || promo.classList.contains('is-closing')) return;
      promo.classList.add('is-closing');
      var done = function () { promo.classList.remove('is-closing'); promo.close(); };
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) done();
      else setTimeout(done, 200);
    }

    promo.addEventListener('cancel', function (event) { event.preventDefault(); close(); });
    promo.addEventListener('click', function (event) { if (event.target === promo) close(); });
    promo.querySelector('.promo__close').addEventListener('click', close);
    promo.querySelector('[data-promo-cta]').addEventListener('click', function () {
      // The link scrolls to the combo deals once the popup is gone
      promo.close();
    });

    // Not when the visitor was sent to a section, e.g. "Continue shopping" from checkout or a section address
    if (location.hash || linkedSection) return;
    setTimeout(function () {
      // Wait for the buyer if a product or cart sheet is already open
      if (document.querySelector('dialog[open]')) return;
      promo.showModal();
    }, 3000);
  })();
})();

/* ---------- "See more" arrow on horizontal scrollers ---------- */
(function () {
  document.querySelectorAll('.carousel, .benefits, .reviews__list, .shop').forEach(function (scroller) {
    // Wrap so the arrow can sit over the scroller's right edge
    var area = document.createElement('div');
    area.className = 'scroll-area';
    scroller.parentNode.insertBefore(area, scroller);
    area.appendChild(scroller);

    var hint = document.createElement('button');
    hint.type = 'button';
    hint.className = 'scroll-hint';
    hint.setAttribute('aria-label', 'Lihat lagi');
    hint.innerHTML = '<img src="assets/icon-see-more.svg?v=a443a171" alt="" width="32" height="32">';
    area.appendChild(hint);

    // Hidden once the row can't scroll any further (or never could)
    function update() {
      var atEnd = scroller.scrollLeft + scroller.clientWidth >= scroller.scrollWidth - 2;
      area.classList.toggle('is-at-end', atEnd);
    }

    hint.addEventListener('click', function () {
      var item = scroller.firstElementChild;
      var step = item ? item.getBoundingClientRect().width : scroller.clientWidth * 0.8;
      scroller.scrollBy({ left: step, behavior: 'smooth' });
    });

    scroller.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    // Images can change the row's width as they load
    scroller.querySelectorAll('img').forEach(function (img) {
      if (!img.complete) img.addEventListener('load', update);
    });
    update();
  });
})();
