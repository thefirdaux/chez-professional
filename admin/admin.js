/*
 * Admin: list paid orders, book couriers through EasyParcel (the AWB is the shipping label)
 * and mark orders shipped.
 * Data comes from /api/admin/orders, which only answers once the admin has signed in.
 */
(function () {
  var view = 'paid';
  var orders = [];
  var easyparcel = { enabled: false, demo: false };
  var COUNTRY_NAMES = { SG: 'Singapore', BN: 'Brunei' }; // Malaysia is left off addresses
  var list = document.querySelector('[data-orders]');
  var message = document.querySelector('[data-message]');
  var app = document.querySelector('[data-app]');
  var loginScreen = document.querySelector('[data-login-screen]');
  var loginForm = document.querySelector('[data-login]');
  var passwordToggle = document.querySelector('[data-toggle-password]');
  var loginError = document.querySelector('[data-login-error]');
  var logoutButton = document.querySelector('[data-logout]');
  var sectionsNav = document.querySelector('[data-sections]');

  function rm(sen) {
    return 'RM ' + (sen / 100).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function formatDate(iso) {
    return iso ? new Date(iso).toLocaleString('en-MY', { dateStyle: 'medium', timeStyle: 'short' }) : '';
  }

  function addressLines(order) {
    return [order.address1, order.address2, order.postcode + ' ' + order.city, order.state, COUNTRY_NAMES[order.country]].filter(Boolean);
  }

  function showMessage(text) {
    message.textContent = text;
    message.hidden = !text;
  }

  function request(url, method, body) {
    return fetch(url, {
      method: method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
      cache: 'no-store'
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) {
          var error = new Error(data.error || 'Something went wrong (' + res.status + ').');
          error.status = res.status;
          throw error;
        }
        return data;
      });
    });
  }

  function api(method, body) {
    return request('/api/admin/orders' + (method === 'GET' ? '?status=' + view : ''), method, body);
  }

  function showLogin(error) {
    document.body.classList.add('is-signed-out');
    app.hidden = true;
    logoutButton.hidden = true;
    sectionsNav.hidden = true;
    loginScreen.hidden = false;
    loginError.textContent = error || '';
    loginError.hidden = !error;
    showMessage('');
    (loginForm.elements.username.value ? loginForm.elements.password : loginForm.elements.username).focus();
  }

  function showApp() {
    document.body.classList.remove('is-signed-out');
    loginScreen.hidden = true;
    loginForm.reset();
    setPasswordVisible(false);
    app.hidden = false;
    logoutButton.hidden = false;
    sectionsNav.hidden = false;
  }

  function setPasswordVisible(visible) {
    loginForm.elements.password.type = visible ? 'text' : 'password';
    passwordToggle.setAttribute('aria-pressed', String(visible));
    passwordToggle.setAttribute('aria-label', visible ? 'Hide password' : 'Show password');
    passwordToggle.querySelector('img').src = visible ? '/admin/icon-eye-off.svg' : '/admin/icon-eye.svg';
  }

  passwordToggle.addEventListener('click', function () {
    setPasswordVisible(loginForm.elements.password.type === 'password');
    loginForm.elements.password.focus();
  });

  function handleError(error) {
    if (error.status === 401) showLogin();
    else showMessage(error.message);
  }

  var searchInput = document.querySelector('[data-search]');

  var STATUS = {
    toShip: { title: 'Order to fulfill', chip: 'To Ship' },
    shipped: { title: 'Shipped order', chip: 'Shipped', done: true },
    pending: { title: 'Waiting for payment', chip: 'Awaiting Payment' },
    failed: { title: 'Payment not completed', chip: 'Failed' }
  };

  function statusOf(order) {
    if (order.status === 'paid') return order.shipped_at ? STATUS.shipped : STATUS.toShip;
    return order.status === 'pending' ? STATUS.pending : STATUS.failed;
  }

  function itemCount(order) {
    return order.items.reduce(function (sum, line) { return sum + line.qty; }, 0);
  }

  function itemText(line) {
    return line.qty + ' x ' + line.name + ' (' + line.size + ')';
  }

  // Orders matching the search box (name, phone, email, address, product or order number)
  function visibleOrders() {
    var words = searchInput.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return orders;
    return orders.filter(function (order) {
      var text = [order.id, order.name, order.phone, order.email, addressLines(order).join(' ')]
        .concat(order.items.map(itemText)).join(' ').toLowerCase();
      return words.every(function (word) { return text.indexOf(word) !== -1; });
    });
  }

  function render() {
    list.textContent = '';
    var shown = visibleOrders();
    if (orders.length === 0) showMessage('No orders here yet.');
    else if (shown.length === 0) showMessage('No orders match "' + searchInput.value.trim() + '".');
    else if (message.textContent.indexOf('No orders') === 0) showMessage('');

    shown.forEach(function (order) {
      var status = statusOf(order);
      var item = el('li', 'order');

      // Header: icon, title, item count · order number · date, status chips
      var head = el('div', 'order__head');
      var heading = el('div', 'order__heading');
      var tile = el('div', 'order__tile');
      tile.appendChild(el('span'));
      heading.appendChild(tile);
      var titles = el('div');
      titles.appendChild(el('p', 'order__title', status.title));
      var count = itemCount(order);
      titles.appendChild(el('p', 'order__sub', [count + (count === 1 ? ' item' : ' items'), order.id, formatDate(order.created_at)].join(' · ')));
      heading.appendChild(titles);
      head.appendChild(heading);
      var chips = el('div', 'order__chips');
      if (order.is_test) chips.appendChild(el('span', 'badge badge--test', 'Test'));
      chips.appendChild(el('span', 'badge' + (status.done ? ' badge--done' : ''), status.chip));
      head.appendChild(chips);
      item.appendChild(head);

      // Body: customer | products | amount and actions
      var body = el('div', 'order__body');
      var customer = el('div', 'order__customer');
      customer.appendChild(el('p', 'order__name', order.name));
      customer.appendChild(el('p', 'order__contact', order.email));
      customer.appendChild(el('p', 'order__contact', order.phone));
      var address = el('p', 'order__address');
      var lines = [[order.address1, order.address2].filter(Boolean).join(', '),
        [order.postcode, order.city, order.state].filter(Boolean).join(', '), COUNTRY_NAMES[order.country]].filter(Boolean);
      lines.forEach(function (line, index) {
        if (index) address.appendChild(el('br'));
        address.appendChild(document.createTextNode(line));
      });
      customer.appendChild(address);
      body.appendChild(customer);

      var products = el('ul', 'order__items');
      order.items.forEach(function (line) { products.appendChild(el('li', null, itemText(line))); });
      body.appendChild(products);

      var side = el('div', 'order__side');
      side.appendChild(el('p', 'order__total', 'RM' + (order.total / 100).toFixed(2)));
      var actions = el('div', 'order__actions');
      var shipBox = el('div', 'ship');
      if (order.status === 'paid') {
        var ship = button(order.shipped_at ? 'Mark Not Shipped' : 'Mark Shipped', !order.shipped_at);
        ship.addEventListener('click', function () {
          ship.disabled = true;
          api('POST', { id: order.id, action: order.shipped_at ? 'unshipped' : 'shipped' }).then(load, function (error) {
            ship.disabled = false;
            handleError(error);
          });
        });
        actions.appendChild(ship);

        if (order.ep_paid_at && order.ep_awb_link) {
          var awb = el('a', 'button button--primary', 'Print AWB');
          awb.href = order.ep_awb_link;
          awb.target = '_blank';
          awb.rel = 'noopener';
          actions.appendChild(awb);
        } else if (!order.ep_order_no && easyparcel.enabled && !order.shipped_at) {
          var book = button('Book Courier', true);
          book.addEventListener('click', function () {
            shipBox.hidden = false;
            openBooking(order, shipBox);
          });
          actions.appendChild(book);
        }
      }
      side.appendChild(actions);
      body.appendChild(side);
      item.appendChild(body);

      // Courier details, or the booking form once Book Courier is pressed
      if (order.status === 'paid') {
        fillShipBox(order, shipBox);
        item.appendChild(shipBox);
      }

      list.appendChild(item);
    });
  }

  searchInput.addEventListener('input', render);

  /* --- Export the orders shown as a spreadsheet (CSV) --- */
  function ringgit(sen) {
    return typeof sen === 'number' ? (sen / 100).toFixed(2) : '';
  }

  function csvCell(value) {
    var text = value == null ? '' : String(value);
    if (/^[=+\-@]/.test(text)) text = "'" + text; // stop spreadsheets running it as a formula
    return /[",\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  }

  document.querySelector('[data-export]').addEventListener('click', function () {
    var rows = [['Order', 'Date', 'Status', 'Name', 'Phone', 'Email', 'Address', 'Postcode', 'City', 'State', 'Country',
      'Items', 'Subtotal (RM)', 'Shipping (RM)', 'Fee (RM)', 'Total (RM)', 'Courier', 'AWB']];
    visibleOrders().forEach(function (order) {
      rows.push([order.id, formatDate(order.created_at), statusOf(order).chip + (order.is_test ? ' (test)' : ''),
        order.name, order.phone, order.email, [order.address1, order.address2].filter(Boolean).join(', '),
        order.postcode, order.city, order.state, order.country || 'MY', order.items.map(itemText).join('; '),
        ringgit(order.subtotal), ringgit(order.shipping), ringgit(order.fee), ringgit(order.total),
        order.ep_courier || '', order.ep_awb || '']);
    });
    var csv = '\ufeff' + rows.map(function (row) { return row.map(csvCell).join(','); }).join('\r\n');
    var link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    link.download = 'chez-orders-' + view + '-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
  });

  // `notice` is shown once the list has loaded (ignored when load is used as a promise callback)
  function load(notice) {
    showMessage('Loading…');
    api('GET').then(function (data) {
      showApp();
      showMessage(typeof notice === 'string' ? notice : '');
      orders = data.orders;
      easyparcel = data.easyparcel || easyparcel;
      loadEasyParcelStatus();
      render();
    }, function (error) {
      orders = [];
      render();
      handleError(error);
    });
  }

  /* --- EasyParcel courier booking --- */
  var DETAIL = { pickup: 'Pickup', dropoff: 'Drop-off', 'dropoff/pickup': 'Pickup or drop-off' };

  function shipApi(body) {
    return request('/api/admin/shipping', 'POST', body);
  }

  function button(text, primary) {
    var node = el('button', 'button' + (primary ? ' button--primary' : ''), text);
    node.type = 'button';
    return node;
  }

  function linkButton(href, text) {
    var node = el('a', 'button', text);
    node.href = href;
    node.target = '_blank';
    node.rel = 'noopener';
    return node;
  }

  /** Courier details for a booked order (hidden when there is nothing to show yet). */
  function fillShipBox(order, box) {
    box.textContent = '';
    box.hidden = !order.ep_order_no;
    if (!order.ep_order_no) return;

    var note = el('p', 'ship__note');
    note.setAttribute('role', 'status');
    var actions = el('div', 'ship__actions');

    function fail(error) {
      if (error.status === 401) showLogin();
      else note.textContent = error.message;
    }

    box.appendChild(el('p', 'ship__title', (order.ep_courier || 'Courier') + (order.ep_awb ? ' · AWB ' + order.ep_awb : '')));
    note.textContent = order.ep_status || (order.ep_awb ? '' : 'Booked. The AWB is not ready yet; press Get AWB in a few minutes.');
    if (order.ep_tracking_url) actions.appendChild(linkButton(order.ep_tracking_url, 'Tracking page'));
    if (!order.ep_awb && easyparcel.enabled) {
      var refreshAwb = button('Get AWB', true);
      refreshAwb.addEventListener('click', function () {
        refreshAwb.disabled = true;
        shipApi({ id: order.id, action: 'refresh' }).then(function () { load(); }, function (error) {
          refreshAwb.disabled = false;
          fail(error);
        });
      });
      actions.appendChild(refreshAwb);
    }
    if (order.ep_awb && easyparcel.enabled) {
      var check = button('Check status');
      check.addEventListener('click', function () {
        check.disabled = true;
        note.textContent = 'Checking…';
        shipApi({ id: order.id, action: 'track' }).then(function (data) {
          check.disabled = false;
          note.textContent = data.status;
        }, function (error) {
          check.disabled = false;
          fail(error);
        });
      });
      actions.appendChild(check);
    }
    if (actions.childNodes.length) box.appendChild(actions);
    box.appendChild(note);
  }

  function openBooking(order, box) {
    box.textContent = '';
    var rates = [];
    var form = el('form', 'ship__form');
    if (easyparcel.demo) form.appendChild(el('p', 'ship__demo', 'EasyParcel demo: nothing is really shipped or charged.'));

    var weightRow = el('div', 'ship__weight');
    var weightId = 'weight-' + order.id;
    var weightLabel = el('label', null, 'Parcel weight (kg)');
    weightLabel.htmlFor = weightId;
    var weight = el('input');
    weight.id = weightId;
    weight.type = 'number';
    weight.step = '0.01';
    weight.min = '0.01';
    weight.max = '30';
    weight.inputMode = 'decimal';
    var refresh = el('button', 'button', 'Update prices');
    refresh.type = 'submit';
    weightRow.appendChild(weightLabel);
    weightRow.appendChild(weight);
    weightRow.appendChild(refresh);
    form.appendChild(weightRow);

    var dateRow = el('div', 'ship__weight');
    var dateId = 'date-' + order.id;
    var dateLabel = el('label', null, 'Pickup / drop-off date');
    dateLabel.htmlFor = dateId;
    var date = el('input');
    date.id = dateId;
    date.type = 'date';
    date.value = date.min = malaysiaToday();
    dateRow.appendChild(dateLabel);
    dateRow.appendChild(date);
    form.appendChild(dateRow);

    var choices = el('fieldset', 'ship__rates');
    choices.appendChild(el('legend', 'visually-hidden', 'Courier'));
    form.appendChild(choices);

    var note = el('p', 'ship__note');
    note.setAttribute('role', 'status');
    form.appendChild(note);

    // What the buyer paid for postage, and the courier priced at checkout
    if (order.ship_cost != null) {
      form.insertBefore(el('p', 'ship__note', 'At checkout: ' + (order.ship_courier || 'estimated postage') + ' ' + rm(order.ship_cost) +
        ' · buyer paid ' + (order.shipping ? rm(order.shipping) : 'nothing') + ' for postage'), weightRow);
    }

    var actions = el('div', 'ship__actions');
    var confirmButton = button('Book & pay', true);
    var cancel = button('Cancel');
    actions.appendChild(confirmButton);
    actions.appendChild(cancel);
    form.appendChild(actions);
    box.appendChild(form);

    function chosen() {
      var radio = choices.querySelector('input:checked');
      return radio ? rates[Number(radio.value)] : null;
    }

    function updateConfirm() {
      var rate = chosen();
      confirmButton.disabled = !rate;
      confirmButton.textContent = rate ? 'Book & pay ' + rm(rate.price) : 'Book & pay';
    }

    function getRates() {
      note.textContent = 'Getting courier prices…';
      confirmButton.disabled = true;
      refresh.disabled = true;
      shipApi({ id: order.id, action: 'quote', weight: weight.value }).then(function (data) {
        refresh.disabled = false;
        weight.value = data.weight;
        rates = data.rates;
        choices.querySelectorAll('.ship__rate').forEach(function (node) { node.remove(); });
        rates.forEach(function (rate, index) {
          var option = el('label', 'ship__rate');
          var radio = el('input');
          radio.type = 'radio';
          radio.name = 'rate-' + order.id;
          radio.value = String(index);
          radio.checked = order.ship_service ? rate.serviceId === order.ship_service : index === 0;
          radio.addEventListener('change', updateConfirm);
          var text = el('span', 'ship__rate-text');
          text.appendChild(el('strong', null, rate.courier));
          // Most service names already say "(Pick Up)" or "(Drop-Off)"
          var detail = /pick|drop/i.test(rate.service) ? '' : DETAIL[rate.detail];
          text.appendChild(el('span', null, [rate.service, detail, rate.delivery].filter(Boolean).join(' · ')));
          option.appendChild(radio);
          option.appendChild(text);
          option.appendChild(el('span', 'ship__price', rm(rate.price)));
          choices.appendChild(option);
        });
        if (rates.length && !choices.querySelector('input:checked')) choices.querySelector('input').checked = true;
        note.textContent = rates.length ? '' : 'No couriers are available for this address and weight.';
        updateConfirm();
      }, function (error) {
        refresh.disabled = false;
        if (error.status === 401) showLogin();
        else note.textContent = error.message;
      });
    }

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      getRates();
    });

    cancel.addEventListener('click', function () {
      fillShipBox(order, box);
    });

    confirmButton.addEventListener('click', function () {
      var rate = chosen();
      if (!rate) return;
      if (!window.confirm('Book ' + rate.courier + ' for ' + rm(rate.price) + '? It is paid from your EasyParcel credit straight away.')) return;
      confirmButton.disabled = true;
      cancel.disabled = true;
      note.textContent = 'Booking…';
      shipApi({ id: order.id, action: 'book', serviceId: rate.serviceId, weight: weight.value, collectDate: date.value }).then(function () {
        load('Courier booked for ' + order.id + '. Print the AWB and stick it on the parcel.');
      }, function (error) {
        if (error.status === 401) return showLogin();
        load(order.id + ': ' + error.message);
      });
    });

    getRates();
    weight.focus();
  }

  function malaysiaToday() {
    return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
  }

  /* --- EasyParcel reminder on the orders page (details are in Settings) --- */
  var epBar = document.querySelector('[data-ep-bar]');

  function loadEasyParcelStatus() {
    epBar.hidden = true;
    if (!easyparcel.enabled) return;
    shipApi({ action: 'status' }).then(function (data) {
      if (data.connected) return;
      epBar.textContent = '';
      epBar.appendChild(el('p', 'ep-bar__text', 'EasyParcel isn\u2019t connected, so couriers can\u2019t be booked yet.'));
      var open = button('Open Settings', true);
      open.addEventListener('click', function () { showSection('settings'); });
      epBar.appendChild(open);
      epBar.hidden = false;
    }, function () { /* shown in Settings */ });
  }

  /* --- Settings --- */
  var settingsSection = document.querySelector('[data-settings-section]');

  function service(name) {
    var card = settingsSection.querySelector('[data-service="' + name + '"]');
    return {
      card: card,
      status: function (text, ok) {
        var badge = card.querySelector('[data-service-status]');
        badge.textContent = text;
        badge.className = 'badge' + (ok ? ' badge--done' : ok === false ? ' badge--warn' : '');
      },
      facts: function (rows) {
        var list = card.querySelector('[data-service-facts]');
        list.textContent = '';
        rows.forEach(function (row) {
          if (row[1] == null || row[1] === '') return;
          var item = el('div', 'service__fact');
          item.appendChild(el('dt', null, row[0]));
          item.appendChild(el('dd', null, row[1]));
          list.appendChild(item);
        });
      }
    };
  }

  function loadSettings() {
    request('/api/admin/settings', 'GET').then(function (data) {
      var chip = service('chip');
      chip.status(data.chip.testMode ? 'Test mode' : 'Connected', !data.chip.testMode);
      chip.facts([
        ['Mode', data.chip.testMode ? 'Test (no real money)' : 'Live'],
        ['Brand', data.chip.brand],
        ['Payment methods', data.chip.methods ? (data.chip.methods.join(', ') || 'None switched on') : 'Couldn\u2019t check right now']
      ]);

      var ep = service('easyparcel');
      var note = ep.card.querySelector('[data-service-note]');
      var actions = ep.card.querySelector('[data-service-actions]');
      var shipFrom = ['Collect from', data.easyparcel.shipFrom];
      actions.textContent = '';
      var site = el('a', 'button', 'Open EasyParcel');
      site.href = 'https://app.easyparcel.com/my/en/';
      site.target = '_blank';
      site.rel = 'noopener';
      if (!data.easyparcel.configured) {
        ep.status('Not set up', false);
        ep.facts([shipFrom]);
        note.textContent = 'Add the EasyParcel app\u2019s client ID and secret in Cloudflare to switch this on.';
        actions.appendChild(site);
        return;
      }
      ep.status('Checking…');
      note.textContent = '';
      shipApi({ action: 'status' }).then(function (status) {
        actions.textContent = '';
        if (status.connected) {
          ep.status('Connected', true);
          ep.facts([
            ['Account', status.demo ? 'Sandbox (nothing is really shipped)' : 'Live'],
            ['Credit', status.balance != null ? rm(status.balance) : ''],
            shipFrom
          ]);
          note.textContent = 'Stays connected while the admin is opened at least once every 30 days.';
          var disconnect = button('Disconnect');
          disconnect.addEventListener('click', function () {
            if (!window.confirm('Disconnect EasyParcel? Couriers can\u2019t be booked until it is connected again.')) return;
            shipApi({ action: 'disconnect' }).then(loadSettings, handleError);
          });
          actions.appendChild(disconnect);
        } else {
          ep.status('Not connected', false);
          ep.facts([shipFrom]);
          note.textContent = 'Sign in to the shop\u2019s EasyParcel account to book couriers from the Orders page.';
          var connect = el('a', 'button button--primary', 'Connect EasyParcel');
          connect.href = '/api/admin/easyparcel-connect';
          actions.appendChild(connect);
        }
        actions.appendChild(site);
      }, function (error) {
        ep.status('Error', false);
        note.textContent = error.message;
        actions.appendChild(site);
      });

      var p = data.postage;
      var covered = p.covered.MY ? 'Courier rate less ' + rm(p.covered.MY) + ' (the shop pays that part)' : 'Courier rate';
      service('postage').facts([
        ['Delivers to', p.countries.join(', ')],
        ['Malaysia', covered],
        ['Singapore and Brunei', p.countries.length > 1
          ? 'Full courier rate; any import duty is paid by the buyer'
          : 'Closed until CHIP card payments are approved (FPX and DuitNow only work with Malaysian banks)'],
        ['If EasyParcel can\u2019t be reached', 'Peninsular ' + rm(p.fallback.west) + ', Sabah/Sarawak/Labuan ' + rm(p.fallback.east) +
          (p.covered.MY ? ' (less ' + rm(p.covered.MY) + ')' : '') + '; abroad the buyer is asked to try again']
      ]);
    }, handleError);
  }

  document.querySelectorAll('[data-view]').forEach(function (tab) {
    tab.addEventListener('click', function () {
      view = tab.dataset.view;
      document.querySelectorAll('[data-view]').forEach(function (t) {
        t.setAttribute('aria-pressed', String(t === tab));
      });
      load();
    });
  });

  loginForm.addEventListener('submit', function (event) {
    event.preventDefault();
    var button = loginForm.querySelector('.login__submit');
    if (!loginForm.elements.username.value.trim() || !loginForm.elements.password.value) {
      showLogin('Please enter your username and password.');
      return;
    }
    button.disabled = true;
    request('/api/admin/login', 'POST', {
      username: loginForm.elements.username.value.trim(),
      password: loginForm.elements.password.value
    }).then(function () {
      button.disabled = false;
      load();
    }, function (error) {
      button.disabled = false;
      loginForm.elements.password.value = '';
      showLogin(error.message);
    });
  });

  logoutButton.addEventListener('click', function () {
    request('/api/admin/logout', 'POST').then(function () {
      orders = [];
      render();
      showLogin();
    }, handleError);
  });

  /* --- Orders / Analytics switch --- */
  var ordersSection = document.querySelector('[data-orders-section]');
  var analyticsSection = document.querySelector('[data-analytics-section]');
  var analyticsBody = document.querySelector('[data-analytics-body]');
  var tooltip = document.querySelector('[data-tooltip]');
  var statsDays = 30;
  var lastStats = null;

  var SECTIONS = {
    orders: { title: 'Sales Monitor', sub: 'Track your daily orders and fulfillment status.', load: load },
    analytics: { title: 'Analytics', sub: 'Visitors, sales and best-selling products.', load: loadStats },
    settings: { title: 'Settings', sub: 'The payment and shipping services the shop is connected to.', load: loadSettings }
  };

  function showSection(name) {
    var section = SECTIONS[name];
    document.querySelectorAll('[data-section]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.section === name));
    });
    ordersSection.hidden = name !== 'orders';
    analyticsSection.hidden = name !== 'analytics';
    settingsSection.hidden = name !== 'settings';
    showMessage('');
    document.querySelector('[data-order-actions]').hidden = name !== 'orders';
    document.querySelector('[data-page-title]').textContent = section.title;
    document.querySelector('[data-page-sub]').textContent = section.sub;
    section.load();
  }

  document.querySelectorAll('[data-section]').forEach(function (button) {
    button.addEventListener('click', function () { showSection(button.dataset.section); });
  });

  document.querySelectorAll('[data-days]').forEach(function (button) {
    button.addEventListener('click', function () {
      statsDays = Number(button.dataset.days);
      document.querySelectorAll('[data-days]').forEach(function (b) {
        b.setAttribute('aria-pressed', String(b === button));
      });
      loadStats();
    });
  });

  function loadStats() {
    // Keep the previous numbers on screen, dimmed, while the new range loads
    analyticsBody.classList.add('is-loading');
    request('/api/admin/stats?days=' + statsDays, 'GET').then(function (data) {
      analyticsBody.classList.remove('is-loading');
      showMessage('');
      lastStats = data;
      renderStats(data);
    }, function (error) {
      analyticsBody.classList.remove('is-loading');
      handleError(error);
    });
  }

  /* --- Formatting --- */
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function shortDate(day) {
    var parts = day.split('-');
    return Number(parts[2]) + ' ' + MONTHS[Number(parts[1]) - 1];
  }

  function compact(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(n >= 10000000 ? 0 : 1).replace(/\.0$/, '') + 'M';
    if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'K';
    return String(n);
  }

  function rmCompact(sen) {
    return 'RM ' + compact(Math.round(sen / 100));
  }

  function percent(fraction) {
    if (!fraction) return '0%';
    var value = fraction * 100;
    return (value < 10 ? value.toFixed(1) : Math.round(value)) + '%';
  }

  /* --- Render --- */
  function renderStats(data) {
    var t = data.totals;
    var kpis = document.querySelector('[data-kpis]');
    kpis.textContent = '';
    [
      ['Visitors', t.visitors.toLocaleString('en-MY')],
      ['Page views', t.views.toLocaleString('en-MY')],
      ['Reached checkout', t.checkoutVisitors.toLocaleString('en-MY')],
      ['Orders', t.orders.toLocaleString('en-MY')],
      ['Sales', t.sales >= 100000 ? 'RM ' + Math.round(t.sales / 100).toLocaleString('en-MY') : rm(t.sales)],
      ['Average order', t.orders ? rm(t.averageOrder) : '—'],
      ['Visitors who bought', percent(t.conversion)]
    ].forEach(function (kpi) {
      var tile = el('div', 'kpi');
      tile.appendChild(el('p', 'kpi__label', kpi[0]));
      tile.appendChild(el('p', 'kpi__value', kpi[1]));
      kpis.appendChild(tile);
    });

    columnChart(document.querySelector('[data-chart="visitors"]'), data.daily, function (d) { return d.visitors; }, {
      format: function (v) { return v.toLocaleString('en-MY'); },
      tick: compact,
      empty: 'No visits recorded in this period yet.',
      details: function (d) { return [[d.visitors.toLocaleString('en-MY'), 'visitors'], [d.views.toLocaleString('en-MY'), 'page views']]; }
    });
    columnChart(document.querySelector('[data-chart="sales"]'), data.daily, function (d) { return d.sales; }, {
      format: rm,
      tick: rmCompact,
      empty: 'No paid orders in this period yet.',
      details: function (d) { return [[rm(d.sales), 'sales'], [String(d.orders), d.orders === 1 ? 'order' : 'orders']]; }
    });

    barList(document.querySelector('[data-list="sources"]'), data.sources, 'No visits yet.');
    barList(document.querySelector('[data-list="devices"]'), data.devices, 'No visits yet.');
    barList(document.querySelector('[data-list="pages"]'), data.pages, 'No visits yet.');

    var products = document.querySelector('[data-products] tbody');
    products.textContent = '';
    if (!data.products.length) {
      var emptyRow = el('tr');
      var cell = el('td', 'table__empty', 'No paid orders in this period yet.');
      cell.colSpan = 3;
      emptyRow.appendChild(cell);
      products.appendChild(emptyRow);
    }
    data.products.forEach(function (p) {
      var row = el('tr');
      var name = el('td');
      name.appendChild(el('span', 'table__name', p.name));
      name.appendChild(el('span', 'table__size', p.size));
      row.appendChild(name);
      row.appendChild(el('td', 'num', String(p.qty)));
      row.appendChild(el('td', 'num', rm(p.sales)));
      products.appendChild(row);
    });

    var daily = document.querySelector('[data-daily] tbody');
    daily.textContent = '';
    data.daily.slice().reverse().forEach(function (d) {
      var row = el('tr');
      row.appendChild(el('td', null, shortDate(d.day)));
      row.appendChild(el('td', 'num', String(d.visitors)));
      row.appendChild(el('td', 'num', String(d.views)));
      row.appendChild(el('td', 'num', String(d.orders)));
      row.appendChild(el('td', 'num', rm(d.sales)));
      daily.appendChild(row);
    });
  }

  /* Horizontal bars: one brand colour, value at the end of each bar */
  function barList(list, rows, emptyText) {
    list.textContent = '';
    if (!rows.length) {
      list.appendChild(el('li', 'bars__empty', emptyText));
      return;
    }
    var total = rows.reduce(function (sum, r) { return sum + r.count; }, 0);
    var max = Math.max.apply(null, rows.map(function (r) { return r.count; }));
    rows.forEach(function (r) {
      var item = el('li', 'bars__item');
      var head = el('div', 'bars__head');
      head.appendChild(el('span', 'bars__name', r.name));
      head.appendChild(el('span', 'bars__value', r.count.toLocaleString('en-MY') + ' · ' + percent(r.count / total)));
      item.appendChild(head);
      var bar = el('div', 'bars__bar');
      bar.style.width = Math.max(2, (r.count / max) * 100) + '%';
      item.appendChild(bar);
      list.appendChild(item);
    });
  }

  /* Column chart drawn as SVG: thin columns, 4px rounded tops, hover tooltip per day */
  var SVG = 'http://www.w3.org/2000/svg';

  function svg(tag, attrs) {
    var node = document.createElementNS(SVG, tag);
    Object.keys(attrs || {}).forEach(function (k) { node.setAttribute(k, attrs[k]); });
    return node;
  }

  function niceMax(value) {
    if (value <= 0) return 4;
    var power = Math.pow(10, Math.floor(Math.log10(value)));
    var steps = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
    for (var i = 0; i < steps.length; i++) if (steps[i] * power >= value) return steps[i] * power;
    return 10 * power;
  }

  function columnChart(box, rows, valueOf, options) {
    box.textContent = '';
    var width = Math.max(280, box.clientWidth);
    var height = 220;
    var pad = { top: 12, right: 8, bottom: 28, left: 52 };
    var innerW = width - pad.left - pad.right;
    var innerH = height - pad.top - pad.bottom;
    var values = rows.map(valueOf);
    var max = niceMax(Math.max.apply(null, values));
    var band = innerW / rows.length;
    var barW = Math.max(2, Math.min(24, band - 2));
    var y = function (v) { return pad.top + innerH - (v / max) * innerH; };

    var chart = svg('svg', { viewBox: '0 0 ' + width + ' ' + height, width: width, height: height, role: 'img' });
    chart.setAttribute('aria-label', box.parentNode.querySelector('.card__title').textContent + ', ' + rows.length + ' days. See the daily numbers table for every value.');

    // Hairline gridlines with clean tick values
    [0, 0.5, 1].forEach(function (f) {
      var v = max * f;
      var gy = y(v);
      chart.appendChild(svg('line', { x1: pad.left, x2: width - pad.right, y1: gy, y2: gy, class: 'chart__grid' }));
      var label = svg('text', { x: pad.left - 8, y: gy + 4, class: 'chart__tick', 'text-anchor': 'end' });
      label.textContent = options.tick(v);
      chart.appendChild(label);
    });

    // A few date labels along the bottom
    var labelEvery = Math.ceil(rows.length / 6);
    rows.forEach(function (row, i) {
      if (i % labelEvery !== 0 && i !== rows.length - 1) return;
      if (i !== rows.length - 1 && rows.length - 1 - i < labelEvery / 2) return;
      var t = svg('text', { x: pad.left + band * i + band / 2, y: height - 8, class: 'chart__tick', 'text-anchor': 'middle' });
      t.textContent = shortDate(row.day);
      chart.appendChild(t);
    });

    rows.forEach(function (row, i) {
      var v = values[i];
      var cx = pad.left + band * i + band / 2;
      if (v > 0) {
        var top = y(v);
        var h = pad.top + innerH - top;
        var r = Math.min(4, barW / 2, h);
        var x0 = cx - barW / 2;
        var x1 = cx + barW / 2;
        var base = pad.top + innerH;
        var d = 'M' + x0 + ',' + base + 'V' + (top + r) + 'Q' + x0 + ',' + top + ' ' + (x0 + r) + ',' + top +
          'H' + (x1 - r) + 'Q' + x1 + ',' + top + ' ' + x1 + ',' + (top + r) + 'V' + base + 'Z';
        chart.appendChild(svg('path', { d: d, class: 'chart__bar', 'data-index': i }));
      }
      // The whole day's column is the hover/focus target, not just the painted bar
      var hit = svg('rect', { x: pad.left + band * i, y: pad.top, width: band, height: innerH, class: 'chart__hit', tabindex: 0 });
      hit.setAttribute('aria-label', shortDate(row.day) + ': ' + options.details(row).map(function (p) { return p.join(' '); }).join(', '));
      var show = function (event) { showTooltip(event, shortDate(row.day), options.details(row)); highlight(chart, i); };
      hit.addEventListener('pointermove', show);
      hit.addEventListener('focus', show);
      hit.addEventListener('pointerleave', function () { hideTooltip(); highlight(chart, -1); });
      hit.addEventListener('blur', function () { hideTooltip(); highlight(chart, -1); });
      chart.appendChild(hit);
    });

    box.appendChild(chart);
    if (values.every(function (v) { return !v; })) box.appendChild(el('p', 'chart__empty', options.empty));
  }

  function highlight(chart, index) {
    chart.querySelectorAll('.chart__bar').forEach(function (bar) {
      bar.classList.toggle('is-active', Number(bar.dataset.index) === index);
    });
  }

  function showTooltip(event, title, parts) {
    tooltip.textContent = '';
    tooltip.appendChild(el('p', 'tooltip__title', title));
    parts.forEach(function (p) {
      var line = el('p', 'tooltip__row');
      line.appendChild(el('strong', null, p[0]));
      line.appendChild(document.createTextNode(' ' + p[1]));
      tooltip.appendChild(line);
    });
    tooltip.hidden = false;
    var rect = event.target.getBoundingClientRect();
    var x = event.clientX || rect.left + rect.width / 2;
    var yPos = event.clientY || rect.top;
    var w = tooltip.offsetWidth;
    tooltip.style.left = Math.min(window.innerWidth - w - 8, Math.max(8, x - w / 2)) + 'px';
    tooltip.style.top = Math.max(8, yPos - tooltip.offsetHeight - 12) + 'px';
  }

  function hideTooltip() { tooltip.hidden = true; }

  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { if (lastStats && !analyticsSection.hidden) renderStats(lastStats); }, 150);
  });

  // Coming back from the EasyParcel sign-in
  var connectParams = new URLSearchParams(window.location.search);
  var connectResult = connectParams.get('easyparcel');
  if (connectResult) history.replaceState(null, '', window.location.pathname);
  load();
  // Back from connecting EasyParcel: show the result on the Settings page
  if (connectResult) {
    var notice = {
      connected: 'EasyParcel is connected.',
      failed: 'EasyParcel could not be connected. ' + (connectParams.get('reason') || 'Please try again.')
    }[connectResult];
    setTimeout(function () {
      if (app.hidden) return;
      showSection('settings');
      if (notice) showMessage(notice);
    }, 600);
  }
})();
