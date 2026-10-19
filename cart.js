/*
 * Shopping cart kept in the buyer's browser (localStorage), shared by every page.
 * Only product ids and quantities are stored; prices always come from products.js.
 */
(function () {
  var KEY = 'chez-cart';
  var MAX_QTY = 20;
  var products = window.CHEZ.products;

  function read() {
    try {
      var items = JSON.parse(localStorage.getItem(KEY)) || [];
      return items.filter(function (item) {
        return products[item.id] && item.qty >= 1;
      });
    } catch (e) {
      return [];
    }
  }

  function write(items) {
    try {
      localStorage.setItem(KEY, JSON.stringify(items));
    } catch (e) { /* storage blocked (private mode): cart lasts for this page only */ }
    memory = items;
    document.dispatchEvent(new CustomEvent('cart:change', { detail: { items: items } }));
  }

  var memory = read();

  function items() {
    return memory.slice();
  }

  function clampQty(qty) {
    return Math.max(1, Math.min(MAX_QTY, Math.floor(qty) || 1));
  }

  function add(id, qty) {
    if (!products[id]) return;
    var list = items();
    var existing = list.filter(function (item) { return item.id === id; })[0];
    if (existing) existing.qty = clampQty(existing.qty + (qty || 1));
    else list.push({ id: id, qty: clampQty(qty || 1) });
    write(list);
  }

  function setQty(id, qty) {
    write(items().map(function (item) {
      return item.id === id ? { id: id, qty: clampQty(qty) } : item;
    }));
  }

  function remove(id) {
    write(items().filter(function (item) { return item.id !== id; }));
  }

  function clear() {
    write([]);
  }

  function count() {
    return memory.reduce(function (sum, item) { return sum + item.qty; }, 0);
  }

  function subtotal() {
    return memory.reduce(function (sum, item) { return sum + products[item.id].price * item.qty; }, 0);
  }

  // Keep tabs in sync when the cart changes in another tab
  window.addEventListener('storage', function (event) {
    if (event.key !== KEY) return;
    memory = read();
    document.dispatchEvent(new CustomEvent('cart:change', { detail: { items: items() } }));
  });

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  // Cart rows with quantity controls, used by the cart sheet and the checkout page
  function renderList(list) {
    var formatRM = window.CHEZ.formatRM;
    list.textContent = '';
    items().forEach(function (item) {
      var product = products[item.id];
      var row = el('li', 'cart-item');
      var img = el('img', 'cart-item__image');
      img.src = 'assets/products/' + item.id + '.png';
      img.alt = '';

      var info = el('div', 'cart-item__info');
      info.appendChild(el('p', 'cart-item__name', product.name));
      info.appendChild(el('p', 'cart-item__size', product.size));
      info.appendChild(el('p', 'cart-item__price', formatRM(product.price)));

      var qty = el('div', 'qty');
      var minus = el('button', 'qty__btn', '\u2212');
      minus.type = 'button';
      minus.setAttribute('aria-label', 'Decrease quantity of ' + product.name);
      minus.disabled = item.qty <= 1;
      minus.addEventListener('click', function () { setQty(item.id, item.qty - 1); });
      var value = el('span', 'qty__value', String(item.qty));
      value.setAttribute('aria-label', 'Quantity ' + item.qty);
      var plus = el('button', 'qty__btn', '+');
      plus.type = 'button';
      plus.setAttribute('aria-label', 'Increase quantity of ' + product.name);
      plus.disabled = item.qty >= MAX_QTY;
      plus.addEventListener('click', function () { setQty(item.id, item.qty + 1); });
      qty.appendChild(minus);
      qty.appendChild(value);
      qty.appendChild(plus);

      var removeBtn = el('button', 'cart-item__remove', 'Remove');
      removeBtn.type = 'button';
      removeBtn.addEventListener('click', function () { remove(item.id); });

      var controls = el('div', 'cart-item__controls');
      controls.appendChild(qty);
      controls.appendChild(removeBtn);
      info.appendChild(controls);

      row.appendChild(img);
      row.appendChild(info);
      list.appendChild(row);
    });
  }

  function updateBadges() {
    var n = count();
    document.querySelectorAll('[data-cart-count]').forEach(function (badge) {
      badge.textContent = n > 99 ? '99+' : String(n);
      badge.hidden = n === 0;
    });
    document.querySelectorAll('.site-header__cart').forEach(function (link) {
      link.setAttribute('aria-label', 'Cart, ' + n + (n === 1 ? ' item' : ' items'));
    });
  }

  document.addEventListener('cart:change', updateBadges);
  document.addEventListener('DOMContentLoaded', updateBadges);
  if (document.readyState !== 'loading') updateBadges();

  window.CHEZ.cart = { items: items, add: add, setQty: setQty, remove: remove, clear: clear, count: count, subtotal: subtotal, renderList: renderList, MAX_QTY: MAX_QTY };
})();
