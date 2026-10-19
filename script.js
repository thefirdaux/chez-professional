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
    CHEZ.shops[list.dataset.shop].forEach(function (id) {
      var product = products[id];
      var card = el('li', 'shop-card' + (product.combo ? ' shop-card--combo' : ''));
      var img = el('img', 'shop-card__image');
      img.src = 'assets/products/' + id + '.png';
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
