/*
 * Checkout page: order summary, contact and address form, shipping fee and totals.
 * The shipping fee comes from /api/shipping-quote (EasyParcel's cheapest courier, less what
 * the shop covers); /api/checkout works it out again when the buyer pays.
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
  var countrySelect = form.querySelector('[data-country-select]');
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

  function addOption(select, value, text) {
    var option = document.createElement('option');
    option.value = value;
    option.textContent = text;
    select.appendChild(option);
  }

  CHEZ.countries.forEach(function (country) { addOption(countrySelect, country[0], country[1]); });

  /* --- Address rules for each country --- */
  var COUNTRY = {
    MY: { postcode: /^\d{5}$/, postcodeLength: 5, postcodeMode: 'numeric', postcodeHint: '', postcodeError: '5 digits.',
      phone: '012-345 6789', phoneError: 'Please enter a valid Malaysian mobile number.',
      places: CHEZ.states.map(function (s) { return s[0]; }), placeLabel: 'State' },
    SG: { postcode: /^\d{6}$/, postcodeLength: 6, postcodeMode: 'numeric', postcodeHint: '', postcodeError: '6 digits.',
      phone: '9123 4567', phoneError: 'Please enter a valid Singapore phone number (8 digits).', places: null },
    BN: { postcode: /^[A-Z]{2}\d{4}$/, postcodeLength: 6, postcodeMode: 'text', postcodeHint: 'BS8811', postcodeError: 'Like BS8811.',
      phone: '712 3456', phoneError: 'Please enter a valid Brunei phone number (7 digits).',
      places: CHEZ.districts, placeLabel: 'District' }
  };
  var PHONE_CODES = { MY: '60', SG: '65', BN: '673' };

  function rules() {
    return COUNTRY[countrySelect.value] || COUNTRY.MY;
  }

  function applyCountry() {
    var r = rules();
    var postcode = form.elements.postcode;
    postcode.maxLength = r.postcodeLength;
    postcode.inputMode = r.postcodeMode;
    postcode.placeholder = r.postcodeHint;
    postcode.style.textTransform = r.postcodeMode === 'text' ? 'uppercase' : '';
    form.querySelector('[data-postcode-error]').textContent = r.postcodeError;
    form.elements.phone.placeholder = r.phone;
    form.querySelector('[data-phone-error]').textContent = r.phoneError;

    // State (Malaysia), district (Brunei) or nothing (Singapore)
    var keep = stateSelect.value;
    stateSelect.textContent = '';
    form.querySelector('[data-state-field]').hidden = !r.places;
    stateSelect.required = Boolean(r.places);
    if (r.places) {
      form.querySelector('[data-state-label]').textContent = r.placeLabel;
      form.querySelector('[data-state-error]').textContent = 'Please select your ' + r.placeLabel.toLowerCase() + '.';
      addOption(stateSelect, '', 'Select ' + r.placeLabel.toLowerCase());
      r.places.forEach(function (place) { addOption(stateSelect, place, place); });
      if (r.places.indexOf(keep) !== -1) stateSelect.value = keep;
    }
    if (countrySelect.value === 'SG' && !cityInput.value.trim()) cityInput.value = 'Singapore';
  }

  /* --- Saved details (this device only) --- */
  var FIELDS = ['name', 'phone', 'email', 'address1', 'address2', 'postcode', 'city', 'country', 'state'];
  var cityInput = form.elements.city;
  try {
    var saved = JSON.parse(localStorage.getItem(SAVED_KEY));
    if (saved) {
      FIELDS.forEach(function (name) {
        if (!saved[name]) return;
        form.elements[name].value = saved[name];
        if (name === 'country') applyCountry(); // so the saved district or state can be selected next
      });
    }
  } catch (e) { /* nothing saved or storage blocked */ }
  if (!countrySelect.value) countrySelect.value = 'MY';
  applyCountry();

  /* --- Postcode lookup: fills in city and state once five digits are typed --- */
  var postcodeInput = form.elements.postcode;
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
    if (countrySelect.value !== 'MY' || !/^\d{5}$/.test(code)) return;
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

  postcodeInput.addEventListener('focus', function () { if (countrySelect.value === 'MY') loadPostcodes(); });
  postcodeInput.addEventListener('input', fillFromPostcode);
  cityInput.addEventListener('input', function () { cityTypedByBuyer = true; });

  /* --- Shipping fee --- */
  var quote = null;        // { fee, covered, label } for the address below
  var quoteKey = '';
  var quoteReady = Promise.resolve();
  var quoteTimer;

  function destination() {
    var postcode = postcodeInput.value.trim().toUpperCase().replace(/\s/g, '');
    var r = rules();
    if (!r.postcode.test(postcode) || (r.places && !stateSelect.value)) return null;
    return { country: countrySelect.value, postcode: postcode, state: r.places ? stateSelect.value : '' };
  }

  // Estimated postage within Malaysia when the order server can't be asked; abroad there is no estimate
  function estimate(where) {
    if (where.country !== 'MY') {
      return { error: 'We can\'t work out the shipping fee to ' + countrySelect.selectedOptions[0].textContent + ' right now. Please try again in a few minutes.' };
    }
    var state = CHEZ.states.filter(function (s) { return s[0] === where.state; })[0];
    var cost = CHEZ.shipping.fallback[state && state[1] === 'east' ? 'east' : 'west'];
    var covered = Math.min(cost, CHEZ.shipping.covered.MY || 0);
    return { fee: cost - covered, covered: covered, label: 'Estimated delivery to ' + where.state };
  }

  function updateQuote() {
    var where = destination();
    var items = cart.items();
    var key = where ? JSON.stringify([where, items]) : '';
    if (key === quoteKey) return;
    quoteKey = key;
    quote = null;
    clearTimeout(quoteTimer);
    if (!where || !items.length) {
      quoteReady = Promise.resolve();
      render();
      return;
    }
    render();
    quoteReady = new Promise(function (resolve) {
      quoteTimer = setTimeout(function () {
        var asked = demo ? Promise.reject(new Error('demo')) : fetch(CHEZ.config.orderApi + '/shipping-quote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: items, destination: where })
        }).then(function (res) {
          if (res.ok) return res.json();
          // The server says why (e.g. no shipping fee abroad right now); otherwise estimate below
          return res.status === 503 ? res.json().then(function (body) { return { error: body.error }; }) : Promise.reject(new Error(res.status));
        });
        asked.catch(function () { return estimate(where); }).then(function (result) {
          if (key === quoteKey) {
            quote = result;
            render();
          }
          resolve();
        });
      }, 350);
    });
  }

  /* --- Summary and totals --- */
  function shippingText(fee) {
    return fee === 0 ? 'Free' : rm(fee);
  }

  function render() {
    var empty = cart.count() === 0;
    form.hidden = empty;
    document.querySelector('[data-checkout-empty]').hidden = !empty;
    if (empty) return;

    cart.renderList(form.querySelector('[data-cart-items]'));

    var subtotal = cart.subtotal();
    var priced = quote && !quote.error;
    var total = subtotal + (priced ? quote.fee : 0) + CHEZ.paymentFee.fee;
    var waiting = !quote && destination();
    form.querySelector('[data-subtotal]').textContent = rm(subtotal);
    form.querySelector('[data-shipping]').textContent = priced ? shippingText(quote.fee) : waiting ? 'Calculating…' : '—';
    form.querySelector('[data-fee]').textContent = rm(CHEZ.paymentFee.fee);
    form.querySelector('[data-total]').textContent = rm(total);
    var abroad = countrySelect.value !== 'MY' ? ' Any import duty or tax is paid by you when the parcel arrives.' : '';
    form.querySelector('[data-shipping-info]').textContent = quote && quote.error ? quote.error
      : priced ? quote.label + ': ' + shippingText(quote.fee) + (quote.covered ? ' (we cover ' + rm(quote.covered) + ' of the postage)' : '') + '.' + abroad
      : waiting ? 'Working out the shipping fee…'
        : 'Enter your ' + (rules().places ? 'postcode and ' + rules().placeLabel.toLowerCase() : 'postal code') + ' to see the shipping fee.';
    payButton.textContent = (demo ? 'Place demo order · ' : 'Pay ') + rm(total);
    demoNotice.hidden = !demo;
    testNotice.hidden = demo || !testMode;
  }

  document.addEventListener('cart:change', function () { render(); updateQuote(); });
  stateSelect.addEventListener('change', updateQuote);
  postcodeInput.addEventListener('input', updateQuote);
  countrySelect.addEventListener('change', function () {
    // A city filled in from a Malaysian postcode doesn't belong to the new country
    if (!cityTypedByBuyer) cityInput.value = '';
    applyCountry();
    form.querySelectorAll('.field.is-invalid .field__input').forEach(checkField);
    updateQuote();
  });
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
    .then(function () {
      quoteKey = '';
      updateQuote();
    });

  /* --- Validation --- */
  function normalizePhone(value) {
    return value.replace(/[\s()-]/g, '');
  }

  function phoneValid(value) {
    var country = countrySelect.value;
    var digits = normalizePhone(value).replace(/^\+/, '');
    var code = PHONE_CODES[country];
    if (digits.indexOf(code) === 0 && digits.length > code.length + 6) digits = digits.slice(code.length);
    if (country === 'MY') return /^0?1\d{8,9}$/.test(digits);
    return country === 'SG' ? /^[3689]\d{7}$/.test(digits) : /^[2-8]\d{6}$/.test(digits);
  }

  function checkField(input) {
    var value = input.value.trim();
    var valid = input.checkValidity();
    if (input.name === 'phone') valid = phoneValid(value);
    if (input.name === 'postcode') valid = rules().postcode.test(value.toUpperCase().replace(/\s/g, ''));
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
    data.postcode = data.postcode.toUpperCase().replace(/\s/g, '');
    if (!rules().places) data.state = '';
    return data;
  }

  /* --- Submit --- */
  form.addEventListener('submit', function (event) {
    event.preventDefault();
    formError.hidden = true;
    configReady.then(function () { return quoteReady; }).then(function () { submit(); });
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

    if (quote && quote.error) {
      formError.textContent = quote.error;
      formError.hidden = false;
      quoteKey = ''; // ask again when the buyer next changes the address or presses Pay
      updateQuote();
      return;
    }

    var details = collect();
    try {
      if (form.elements.remember.checked) localStorage.setItem(SAVED_KEY, JSON.stringify(details));
      else localStorage.removeItem(SAVED_KEY);
    } catch (e) { /* storage blocked */ }

    var items = cart.items();
    var shipping = quote || estimate(destination());
    if (shipping.error) {
      formError.textContent = shipping.error;
      formError.hidden = false;
      return;
    }
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
        if (typeof result.body.shipping === 'number') order.shipping = result.body.shipping;
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
