/*
 * Checkout page: order summary, contact and address form, shipping fee and totals.
 * Runs in demo mode (nothing is charged) until the order server reports that CHIP payment
 * is switched on; see functions/api/checkout-config.js.
 */
(function () {
  var CHEZ = window.CHEZ;
  var cart = CHEZ.cart;
  var rm = CHEZ.formatRM;
  var SAVED_KEY = 'chez-customer';
  var demo = true;
  var testMode = false;

  var form = document.querySelector('[data-checkout-form]');
  var stateSelect = form.querySelector('[data-state-select]');
  var payButton = form.querySelector('[data-pay-button]');
  var formError = form.querySelector('[data-form-error]');

  var demoNotice = document.querySelector('[data-demo-notice]');
  var testNotice = document.querySelector('[data-test-notice]');
  var paymentNotice = document.querySelector('[data-payment-notice]');

  // Coming back from CHIP without paying
  var payment = new URLSearchParams(window.location.search).get('payment');
  if (payment === 'failed' || payment === 'cancelled') {
    paymentNotice.textContent = payment === 'failed'
      ? 'Your payment was not completed. Your cart is still here, so you can try again.'
      : 'Payment cancelled. Your cart is still here whenever you are ready.';
    paymentNotice.hidden = false;
  }

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

  /* --- Postcode lookup: fills in city and state once five digits are typed --- */
  var postcodeInput = form.elements.postcode;
  var cityInput = form.elements.city;
  var cityTypedByBuyer = false;
  var postcodeTable = null;

  function loadPostcodes() {
    if (!postcodeTable) {
      postcodeTable = fetch('assets/postcodes.json?v=33470926').then(function (res) {
        if (!res.ok) throw new Error('postcodes ' + res.status);
        return res.json();
      }).then(function (data) {
        // codes: "43000123.9,…" = postcode, index into cities, ".", index into states
        var map = {};
        data.codes.split(',').forEach(function (row) {
          var dot = row.indexOf('.');
          map[row.slice(0, 5)] = [data.cities[+row.slice(5, dot)], data.states[+row.slice(dot + 1)]];
        });
        return map;
      }).catch(function () {
        postcodeTable = null; // try again next time; the buyer can still type city and state
        return {};
      });
    }
    return postcodeTable;
  }

  function fillFromPostcode() {
    var code = postcodeInput.value.trim();
    if (!/^\d{5}$/.test(code)) return;
    loadPostcodes().then(function (map) {
      var match = map[code];
      if (!match || postcodeInput.value.trim() !== code) return;
      // Never overwrite a city the buyer typed on this page (saved or auto-filled ones are fine)
      if (!cityTypedByBuyer || !cityInput.value.trim()) {
        cityInput.value = match[0];
        if (cityInput.closest('.field').classList.contains('is-invalid')) checkField(cityInput);
      }
      if (stateSelect.value !== match[1]) {
        stateSelect.value = match[1];
        stateSelect.dispatchEvent(new Event('change', { bubbles: true }));
        if (stateSelect.closest('.field').classList.contains('is-invalid')) checkField(stateSelect);
      }
    });
  }

  postcodeInput.addEventListener('focus', loadPostcodes);
  postcodeInput.addEventListener('input', fillFromPostcode);
  cityInput.addEventListener('input', function () { cityTypedByBuyer = true; });

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
    var total = subtotal + (shipping ? shipping.fee : 0) + CHEZ.paymentFee.fee;
    form.querySelector('[data-subtotal]').textContent = rm(subtotal);
    form.querySelector('[data-shipping]').textContent = shipping ? rm(shipping.fee) : '—';
    form.querySelector('[data-fee]').textContent = rm(CHEZ.paymentFee.fee);
    form.querySelector('[data-total]').textContent = rm(total);
    form.querySelector('[data-shipping-info]').textContent = shipping
      ? 'Standard delivery to ' + shipping.label + ': ' + rm(shipping.fee)
      : 'Select your state to see the shipping fee.';
    payButton.textContent = (demo ? 'Place demo order · ' : 'Pay ') + rm(total);
    demoNotice.hidden = !demo;
    testNotice.hidden = demo || !testMode;
  }

  document.addEventListener('cart:change', render);
  stateSelect.addEventListener('change', render);
  render();

  // Ask the order server whether real payment is on. No server, an error or a slow answer keeps demo mode.
  var configReady = fetch(CHEZ.config.orderApi + '/checkout-config', { cache: 'no-store' })
    .then(function (res) { return res.ok ? res.json() : null; })
    .then(function (config) {
      if (config && config.enabled) {
        demo = false;
        testMode = Boolean(config.testMode);
      }
    })
    .catch(function () { /* stay in demo mode */ })
    .then(render);

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
    configReady.then(function () { submit(); });
  });

  function submit() {

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
    var order = {
      number: 'DEMO-' + String(Date.now()).slice(-6),
      items: items.map(function (item) {
        var p = CHEZ.products[item.id];
        return { name: p.name, size: p.size, qty: item.qty, price: p.price };
      }),
      subtotal: cart.subtotal(),
      shipping: shipping.fee,
      fee: CHEZ.paymentFee.fee,
      total: cart.subtotal() + shipping.fee + CHEZ.paymentFee.fee,
      shipTo: details
    };

    function remember(summary) {
      try { sessionStorage.setItem('chez-last-order', JSON.stringify(summary)); } catch (e) { /* ignore */ }
    }

    if (demo) {
      remember(order);
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
        if (!result.ok || !result.body.checkoutUrl) {
          var serverError = new Error(result.body.error || '');
          serverError.fromServer = true;
          throw serverError;
        }
        // The cart is only emptied once the thank-you page confirms the payment
        order.number = result.body.orderId;
        order.total = result.body.total;
        remember(order);
        window.location.href = result.body.checkoutUrl;
      })
      .catch(function (error) {
        formError.textContent = (error.fromServer && error.message) || 'Sorry, we could not start the payment. Please try again in a moment.';
        formError.hidden = false;
        payButton.disabled = false;
        render();
      });
  }
})();
