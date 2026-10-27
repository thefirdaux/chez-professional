/*
 * Admin: list paid orders, mark them shipped and print A5 shipping labels.
 * Data comes from /api/admin/orders, which only answers once the admin has signed in.
 */
(function () {
  // Sender details printed on every label
  var SENDER = {
    name: 'Chez Professional',
    phone: '011-59500464',
    address: ['No. 2, Lorong 3/27C, Seksyen 5', 'Wangsa Maju', '53300 Kuala Lumpur']
  };

  var view = 'paid';
  var orders = [];
  var easyparcel = { enabled: false, demo: false };
  var list = document.querySelector('[data-orders]');
  var message = document.querySelector('[data-message]');
  var printButton = document.querySelector('[data-print]');
  var selectAll = document.querySelector('[data-select-all]');
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
    return [order.address1, order.address2, order.postcode + ' ' + order.city, order.state].filter(Boolean);
  }

  function showMessage(text) {
    message.textContent = text;
    message.hidden = !text;
  }

  function selectedOrders() {
    return orders.filter(function (order) {
      var box = list.querySelector('input[data-id="' + order.id + '"]');
      return box && box.checked;
    });
  }

  function updateToolbar() {
    var count = selectedOrders().length;
    printButton.disabled = count === 0;
    printButton.textContent = count ? 'Print ' + count + ' A5 label' + (count === 1 ? '' : 's') : 'Print A5 labels';
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

  function render() {
    list.textContent = '';
    selectAll.checked = false;
    if (orders.length === 0) showMessage('No orders here yet.');

    orders.forEach(function (order) {
      var item = el('li', 'order');

      var head = el('div', 'order__head');
      var check = el('input');
      check.type = 'checkbox';
      check.dataset.id = order.id;
      check.setAttribute('aria-label', 'Select order ' + order.id);
      check.addEventListener('change', updateToolbar);
      head.appendChild(check);
      head.appendChild(el('strong', 'order__id', order.id));
      head.appendChild(el('span', 'order__date', formatDate(order.created_at)));
      if (order.is_test) head.appendChild(el('span', 'badge badge--test', 'Test'));
      if (order.status !== 'paid') head.appendChild(el('span', 'badge', order.status));
      if (order.printed_at) head.appendChild(el('span', 'badge', 'Label printed'));
      if (order.shipped_at) head.appendChild(el('span', 'badge badge--done', 'Shipped'));
      item.appendChild(head);

      var who = el('div', 'order__who');
      who.appendChild(el('p', 'order__name', order.name));
      who.appendChild(el('p', null, order.phone + ' · ' + order.email));
      who.appendChild(el('p', null, addressLines(order).join(', ')));
      item.appendChild(who);

      var items = el('ul', 'order__items');
      order.items.forEach(function (line) {
        items.appendChild(el('li', null, line.qty + ' × ' + line.name + ' (' + line.size + ')'));
      });
      item.appendChild(items);

      var foot = el('div', 'order__foot');
      foot.appendChild(el('span', 'order__total', rm(order.total)));
      if (order.status === 'paid') {
        var ship = el('button', 'button', order.shipped_at ? 'Mark not shipped' : 'Mark shipped');
        ship.type = 'button';
        ship.addEventListener('click', function () {
          ship.disabled = true;
          api('POST', { id: order.id, action: order.shipped_at ? 'unshipped' : 'shipped' }).then(load, function (error) {
            ship.disabled = false;
            handleError(error);
          });
        });
        foot.appendChild(ship);
      }
      item.appendChild(foot);
      if (order.status === 'paid' && (easyparcel.enabled || order.ep_order_no)) item.appendChild(shippingBlock(order));

      list.appendChild(item);
    });
    updateToolbar();
  }

  // `notice` is shown once the list has loaded (ignored when load is used as a promise callback)
  function load(notice) {
    showMessage('Loading…');
    api('GET').then(function (data) {
      showApp();
      showMessage(typeof notice === 'string' ? notice : '');
      orders = data.orders;
      easyparcel = data.easyparcel || easyparcel;
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

  function shippingBlock(order) {
    var box = el('div', 'ship');
    var note = el('p', 'ship__note');
    note.setAttribute('role', 'status');
    var actions = el('div', 'ship__actions');

    function fail(error) {
      if (error.status === 401) showLogin();
      else note.textContent = error.message;
    }

    if (order.ep_paid_at) {
      box.appendChild(el('p', 'ship__title', (order.ep_courier || 'Courier') + (order.ep_awb ? ' · AWB ' + order.ep_awb : '')));
      note.textContent = order.ep_status || (order.ep_awb ? '' : 'Paid. The AWB is not ready yet; print it from EasyParcel → My Shipments.');
      if (order.ep_awb_link) actions.appendChild(linkButton(order.ep_awb_link, 'Print AWB'));
      if (order.ep_tracking_url) actions.appendChild(linkButton(order.ep_tracking_url, 'Tracking page'));
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
    } else if (order.ep_order_no) {
      box.appendChild(el('p', 'ship__title', (order.ep_courier || 'Courier') + ' booked, not paid yet'));
      note.textContent = 'EasyParcel order ' + order.ep_order_no + '. If your credit ran out, top up in EasyParcel and press Pay.';
      var pay = button('Pay ' + (order.ep_price ? rm(order.ep_price) : 'now'), true);
      pay.addEventListener('click', function () {
        pay.disabled = true;
        shipApi({ id: order.id, action: 'pay' }).then(function () {
          load('Paid. You can print the AWB now.');
        }, function (error) {
          pay.disabled = false;
          fail(error);
        });
      });
      actions.appendChild(pay);
    } else {
      var book = button('Book courier', true);
      book.addEventListener('click', function () { openBooking(order, box); });
      actions.appendChild(book);
    }

    if (actions.childNodes.length) box.appendChild(actions);
    box.appendChild(note);
    return box;
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

    var choices = el('fieldset', 'ship__rates');
    choices.appendChild(el('legend', 'visually-hidden', 'Courier'));
    form.appendChild(choices);

    var note = el('p', 'ship__note');
    note.setAttribute('role', 'status');
    form.appendChild(note);

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
          radio.checked = index === 0;
          radio.addEventListener('change', updateConfirm);
          var text = el('span', 'ship__rate-text');
          text.appendChild(el('strong', null, rate.courier));
          text.appendChild(el('span', null, [rate.service, DETAIL[rate.detail], rate.delivery].filter(Boolean).join(' · ')));
          option.appendChild(radio);
          option.appendChild(text);
          option.appendChild(el('span', 'ship__price', rm(rate.price)));
          choices.appendChild(option);
        });
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
      box.replaceWith(shippingBlock(order));
    });

    confirmButton.addEventListener('click', function () {
      var rate = chosen();
      if (!rate) return;
      if (!window.confirm('Book ' + rate.courier + ' for ' + rm(rate.price) + '? This is paid from your EasyParcel credit.')) return;
      confirmButton.disabled = true;
      cancel.disabled = true;
      note.textContent = 'Booking…';
      shipApi({ id: order.id, action: 'book', serviceId: rate.serviceId, weight: weight.value, collectDate: rate.pickupDate }).then(function () {
        load('Courier booked for ' + order.id + '. Print the AWB and stick it on the parcel.');
      }, function (error) {
        if (error.status === 401) return showLogin();
        // The shipment may have been created even though payment failed, so show the latest state
        load(order.id + ': ' + error.message);
      });
    });

    getRates();
    weight.focus();
  }

  /* --- A5 labels --- */
  function buildLabels(selected) {
    var labels = document.querySelector('[data-labels]');
    labels.textContent = '';
    selected.forEach(function (order) {
      var label = el('section', 'label');

      var to = el('div', 'label__block label__to');
      to.appendChild(el('p', 'label__heading', 'TO'));
      to.appendChild(el('p', 'label__name', order.name));
      to.appendChild(el('p', 'label__phone', order.phone));
      addressLines(order).forEach(function (line) { to.appendChild(el('p', null, line)); });
      label.appendChild(to);

      var from = el('div', 'label__block label__from');
      from.appendChild(el('p', 'label__heading', 'FROM'));
      from.appendChild(el('p', 'label__name', SENDER.name));
      if (SENDER.phone) from.appendChild(el('p', null, SENDER.phone));
      SENDER.address.forEach(function (line) { from.appendChild(el('p', null, line)); });
      label.appendChild(from);

      var meta = el('div', 'label__block label__meta');
      meta.appendChild(el('p', 'label__heading', 'ORDER ' + order.id + ' · ' + formatDate(order.paid_at || order.created_at)));
      var items = el('ul');
      order.items.forEach(function (line) {
        items.appendChild(el('li', null, line.qty + ' × ' + line.name + ' (' + line.size + ')'));
      });
      meta.appendChild(items);
      label.appendChild(meta);

      labels.appendChild(label);
    });
  }

  printButton.addEventListener('click', function () {
    var selected = selectedOrders();
    if (!selected.length) return;
    buildLabels(selected);
    window.print();
    // Record that these labels were printed
    Promise.all(selected.map(function (order) {
      return api('POST', { id: order.id, action: 'printed' });
    })).then(load, handleError);
  });

  selectAll.addEventListener('change', function () {
    list.querySelectorAll('input[type="checkbox"]').forEach(function (box) { box.checked = selectAll.checked; });
    updateToolbar();
  });

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

  document.querySelectorAll('[data-section]').forEach(function (button) {
    button.addEventListener('click', function () {
      var analytics = button.dataset.section === 'analytics';
      document.querySelectorAll('[data-section]').forEach(function (b) {
        b.setAttribute('aria-pressed', String(b === button));
      });
      ordersSection.hidden = analytics;
      analyticsSection.hidden = !analytics;
      if (analytics) loadStats(); else load();
    });
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

  load();
})();
