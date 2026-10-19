/*
 * Checkout page: order summary, contact and address form, shipping fee and totals.
 * While CHEZ.config.orderApi is empty the page runs in demo mode: nothing is charged.
 */
(function () {
  var CHEZ = window.CHEZ;
  var cart = CHEZ.cart;
  var rm = CHEZ.formatRM;
  var SAVED_KEY = 'chez-customer';
  var demo = !CHEZ.config.orderApi;

  var form = document.querySelector('[data-checkout-form]');
  var stateSelect = form.querySelector('[data-state-select]');
  var payButton = form.querySelector('[data-pay-button]');
  var formError = form.querySelector('[data-form-error]');

  document.querySelector('[data-demo-notice]').hidden = !demo;

  CHEZ.states.forEach(function (state) {
    var option = document.createElement('option');
    option.value = state[0];
    option.textContent = state[0];
    stateSelect.appendChild(option);
  });

  function regionOf(stateName) {
    var match = CHEZ.states.filter(function (state) { return state[0] === stateName; })[0];
    return match ? match[1] : null;
  }

  /* --- Saved details (this device only) --- */
  var FIELDS = ['name', 'phone', 'email', 'address1', 'address2', 'postcode', 'city', 'state'];
  try {
    var saved = JSON.parse(localStorage.getItem(SAVED_KEY));
    if (saved) FIELDS.forEach(function (name) { if (saved[name]) form.elements[name].value = saved[name]; });
  } catch (e) { /* nothing saved or storage blocked */ }

  /* --- Summary and totals --- */
  function shippingFee() {
    var region = regionOf(stateSelect.value);
    return region ? CHEZ.shipping[region] : null;
  }

  function render() {
    var empty = cart.count() === 0;
    form.hidden = empty;
    document.querySelector('[data-checkout-empty]').hidden = !empty;
    if (empty) return;

    cart.renderList(form.querySelector('[data-cart-items]'));

    var subtotal = cart.subtotal();
    var shipping = shippingFee();
    var total = subtotal + (shipping ? shipping.fee : 0);
    form.querySelector('[data-subtotal]').textContent = rm(subtotal);
    form.querySelector('[data-shipping]').textContent = shipping ? rm(shipping.fee) : '—';
    form.querySelector('[data-total]').textContent = rm(total);
    form.querySelector('[data-shipping-info]').textContent = shipping
      ? 'Standard delivery to ' + shipping.label + ': ' + rm(shipping.fee)
      : 'Select your state to see the shipping fee.';
    payButton.textContent = (demo ? 'Place demo order · ' : 'Pay ') + rm(total);
  }

  document.addEventListener('cart:change', render);
  stateSelect.addEventListener('change', render);
  render();

  /* --- Validation --- */
  function normalizePhone(value) {
    return value.replace(/[\s-]/g, '');
  }

  function checkField(input) {
    var value = input.value.trim();
    var valid = input.checkValidity();
    if (input.name === 'phone') valid = /^(\+?60|0)1\d{8,9}$/.test(normalizePhone(value));
    if (input.name === 'postcode') valid = /^\d{5}$/.test(value);
    if (input.required && !value) valid = false;
    input.closest('.field').classList.toggle('is-invalid', !valid);
    input.setAttribute('aria-invalid', String(!valid));
    return valid;
  }

  form.querySelectorAll('.field__input').forEach(function (input) {
    // Only start flagging a field once the buyer has left it, then update live
    input.addEventListener('blur', function () { if (input.value) checkField(input); });
    input.addEventListener('input', function () {
      if (input.closest('.field').classList.contains('is-invalid')) checkField(input);
    });
  });

  function collect() {
    var data = {};
    FIELDS.forEach(function (name) { data[name] = form.elements[name].value.trim(); });
    data.phone = normalizePhone(data.phone);
    return data;
  }

  /* --- Submit --- */
  form.addEventListener('submit', function (event) {
    event.preventDefault();
    formError.hidden = true;

    var firstInvalid = null;
    form.querySelectorAll('.field__input').forEach(function (input) {
      if (!checkField(input) && !firstInvalid) firstInvalid = input;
    });
    if (firstInvalid) {
      firstInvalid.focus();
      return;
    }

    var details = collect();
    try {
      if (form.elements.remember.checked) localStorage.setItem(SAVED_KEY, JSON.stringify(details));
      else localStorage.removeItem(SAVED_KEY);
    } catch (e) { /* storage blocked */ }

    var items = cart.items();
    var shipping = shippingFee();

    if (demo) {
      var order = {
        number: 'DEMO-' + String(Date.now()).slice(-6),
        items: items.map(function (item) {
          var p = CHEZ.products[item.id];
          return { name: p.name, size: p.size, qty: item.qty, price: p.price };
        }),
        subtotal: cart.subtotal(),
        shipping: shipping.fee,
        total: cart.subtotal() + shipping.fee,
        shipTo: details
      };
      try { sessionStorage.setItem('chez-last-order', JSON.stringify(order)); } catch (e) { /* ignore */ }
      cart.clear();
      window.location.href = 'order-success.html?demo=1';
      return;
    }

    // Live: the order server recalculates prices and shipping, creates the CHIP payment
    // and returns the CHIP checkout page to send the buyer to.
    payButton.disabled = true;
    payButton.textContent = 'Processing…';
    fetch(CHEZ.config.orderApi + '/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: items, customer: details })
    })
      .then(function (res) { return res.json().then(function (body) { return { ok: res.ok, body: body }; }); })
      .then(function (result) {
        if (!result.ok || !result.body.checkoutUrl) throw new Error(result.body.error || 'checkout failed');
        window.location.href = result.body.checkoutUrl;
      })
      .catch(function () {
        formError.textContent = 'Sorry, we could not start the payment. Please try again in a moment.';
        formError.hidden = false;
        payButton.disabled = false;
        render();
      });
  });
})();
