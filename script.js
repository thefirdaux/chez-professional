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

      var name = el('div', 'shop-card__name');
      name.appendChild(el('h4', null, product.name));
      name.appendChild(el('p', null, product.size));
      var details = el('div', 'shop-card__details');
      details.appendChild(name);
      details.appendChild(priceNode(product, 'shop-card__price'));

      var buy = el('button', 'shop-card__buy', 'Buy Now');
      buy.type = 'button';
      buy.dataset.product = id;

      var body = el('div', 'shop-card__body');
      body.appendChild(details);
      body.appendChild(buy);
      card.appendChild(img);
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
    field('was').textContent = product.was ? rm(product.was) : '';
    field('price').textContent = rm(product.price);
    field('price').classList.toggle('is-sale', !!product.was);
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
      showToast('Added to cart');
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
    hint.setAttribute('aria-label', 'See more');
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
