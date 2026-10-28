/*
 * Admin: list paid orders, book couriers through EasyParcel (the AWB is the shipping label)
 * and mark orders shipped.
 * Data comes from /api/admin/orders, which only answers once the admin has signed in.
 */
(function () {
  var view = 'paid';
  var orders = [];
  var selected = {}; // order id → true, for booking couriers and printing AWBs in one go
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
      if (isSelectable(order)) {
        var pick = el('input', 'order__check');
        pick.type = 'checkbox';
        pick.checked = Boolean(selected[order.id]);
        pick.setAttribute('aria-label', 'Select order ' + order.id);
        pick.addEventListener('change', function () {
          if (pick.checked) selected[order.id] = true;
          else delete selected[order.id];
          item.classList.toggle('order--selected', pick.checked);
          renderBulk();
        });
        item.classList.toggle('order--selected', pick.checked);
        heading.appendChild(pick);
      }
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
    renderBulk();
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
      // Forget ticks on orders that have left this list (shipped, or another tab)
      var kept = {};
      orders.forEach(function (order) {
        if (selected[order.id] && isSelectable(order)) kept[order.id] = true;
      });
      selected = kept;
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

  /* --- Several orders at once: book one courier for all, print every AWB in one PDF, mark shipped --- */
  var bulkBar = document.querySelector('[data-bulk]');
  var bulkAll = document.querySelector('[data-bulk-all]');
  var bulkCount = document.querySelector('[data-bulk-count]');
  var bulkBook = document.querySelector('[data-bulk-book]');
  var bulkPrint = document.querySelector('[data-bulk-print]');
  var bulkShipped = document.querySelector('[data-bulk-shipped]');
  var bulkDialog = document.querySelector('[data-bulk-dialog]');
  var bulkBusy = false;

  // Paid orders still waiting to be shipped can be ticked
  function isSelectable(order) {
    return order.status === 'paid' && !order.shipped_at;
  }

  function canBook(order) {
    return easyparcel.enabled && !order.ep_order_no && (!order.is_test || easyparcel.demo);
  }

  // Booked, with an AWB link already or one EasyParcel can be asked for
  function canPrint(order) {
    return Boolean(order.ep_awb_link || (easyparcel.enabled && order.ep_order_no && order.ep_order_no !== 'booked'));
  }

  function selectableShown() {
    return view === 'paid' ? visibleOrders().filter(isSelectable) : [];
  }

  function selectedShown() {
    return selectableShown().filter(function (order) { return selected[order.id]; });
  }

  function plural(count, word) {
    return count + ' ' + word + (count === 1 ? '' : 's');
  }

  function renderBulk() {
    var shown = selectableShown();
    var picked = selectedShown();
    bulkBar.hidden = shown.length < 2;
    bulkAll.checked = shown.length > 0 && picked.length === shown.length;
    bulkAll.indeterminate = picked.length > 0 && picked.length < shown.length;
    bulkCount.textContent = picked.length ? picked.length + ' of ' + shown.length + ' selected' : 'Select all (' + shown.length + ')';

    var toBook = picked.filter(canBook).length;
    var toPrint = picked.filter(canPrint).length;
    bulkBook.hidden = !easyparcel.enabled;
    bulkBook.disabled = bulkBusy || !toBook;
    bulkBook.textContent = 'Book Courier' + (toBook ? ' (' + toBook + ')' : '');
    bulkPrint.disabled = bulkBusy || !toPrint;
    bulkPrint.textContent = 'Print AWB' + (toPrint ? ' (' + toPrint + ')' : '');
    bulkShipped.disabled = bulkBusy || !picked.length;
    bulkShipped.textContent = 'Mark Shipped' + (picked.length ? ' (' + picked.length + ')' : '');
  }

  bulkAll.addEventListener('change', function () {
    var tick = bulkAll.checked;
    selectableShown().forEach(function (order) {
      if (tick) selected[order.id] = true;
      else delete selected[order.id];
    });
    render();
  });

  // Runs task(item) for each item, `limit` at a time, in the list's order of starting
  function eachLimited(items, limit, task) {
    var next = 0;
    function worker() {
      if (next >= items.length) return Promise.resolve();
      var item = items[next++];
      return task(item).then(worker);
    }
    var workers = [];
    for (var i = 0; i < Math.min(limit, items.length); i++) workers.push(worker());
    return Promise.all(workers);
  }

  function orderLabel(order) {
    return order.id + ' (' + order.name + ', ' + (COUNTRY_NAMES[order.country] || order.state) + ')';
  }

  function fillIssues(listNode, rows) {
    listNode.textContent = '';
    rows.forEach(function (row) { listNode.appendChild(el('li', null, row)); });
    listNode.hidden = !rows.length;
  }

  bulkDialog.addEventListener('cancel', function (event) {
    if (bulkBusy) event.preventDefault(); // don't close halfway through booking
  });

  bulkBook.addEventListener('click', function () {
    var targets = selectedShown().filter(canBook);
    if (targets.length) openBulkBooking(targets);
  });

  function openBulkBooking(targets) {
    var quotes = {};
    var options = [];
    var balance = null;
    bulkDialog.textContent = '';

    var form = el('form', 'bulk-dialog__body');
    form.method = 'dialog';
    var title = el('h2', 'bulk-dialog__title', 'Book courier for ' + plural(targets.length, 'order'));
    form.appendChild(title);
    var intro = el('p', 'ship__note', 'One courier for all of them, at each order\u2019s usual parcel weight. To change a weight, book that order on its own.');
    form.appendChild(intro);
    if (easyparcel.demo) form.appendChild(el('p', 'ship__demo', 'EasyParcel demo: nothing is really shipped or charged.'));

    var dateRow = el('div', 'ship__weight');
    var dateLabel = el('label', null, 'Pickup / drop-off date');
    dateLabel.htmlFor = 'bulk-date';
    var date = el('input');
    date.id = 'bulk-date';
    date.type = 'date';
    date.value = date.min = malaysiaToday();
    dateRow.appendChild(dateLabel);
    dateRow.appendChild(date);
    form.appendChild(dateRow);

    var choices = el('fieldset', 'ship__rates');
    choices.appendChild(el('legend', 'visually-hidden', 'Courier'));
    form.appendChild(choices);

    var issues = el('ul', 'bulk-dialog__issues');
    issues.hidden = true;
    form.appendChild(issues);

    var note = el('p', 'ship__note');
    note.setAttribute('role', 'status');
    form.appendChild(note);

    var actions = el('div', 'ship__actions');
    var confirmButton = button('Book & pay', true);
    confirmButton.disabled = true;
    var cancel = button('Cancel');
    actions.appendChild(confirmButton);
    actions.appendChild(cancel);
    form.appendChild(actions);
    bulkDialog.appendChild(form);
    bulkDialog.showModal();

    cancel.addEventListener('click', function () { bulkDialog.close(); });

    function chosen() {
      var radio = choices.querySelector('input:checked');
      return radio ? options[Number(radio.value)] : null;
    }

    function update() {
      var option = chosen();
      var rows = [];
      targets.forEach(function (order) {
        var quote = quotes[order.id];
        if (quote && quote.error) rows.push(orderLabel(order) + ': ' + quote.error);
        else if (option && !(order.id in option.prices)) rows.push(orderLabel(order) + ': ' + option.courier + ' doesn\u2019t deliver there. Book it on its own.');
      });
      fillIssues(issues, rows.length ? ['Not included:'].concat(rows) : []);

      note.textContent = balance != null ? 'EasyParcel credit: ' + rm(balance) : '';
      confirmButton.disabled = !option;
      confirmButton.textContent = 'Book & pay';
      if (!option) return;
      var count = Object.keys(option.prices).length;
      confirmButton.textContent = 'Book ' + plural(count, 'order') + ' & pay ' + rm(option.total);
      if (balance != null && option.total > balance) {
        note.textContent = 'Not enough EasyParcel credit (' + rm(balance) + ') for ' + rm(option.total) + '. Top up in EasyParcel first, or tick fewer orders.';
        confirmButton.disabled = true;
      }
    }

    function showOptions() {
      var byService = {};
      targets.forEach(function (order) {
        var quote = quotes[order.id];
        if (!quote || !quote.rates) return;
        quote.rates.forEach(function (rate) {
          var option = byService[rate.serviceId];
          if (!option) {
            option = byService[rate.serviceId] = { serviceId: rate.serviceId, courier: rate.courier, service: rate.service, detail: rate.detail, delivery: rate.delivery, total: 0, prices: {} };
            options.push(option);
          }
          option.prices[order.id] = rate.price;
          option.total += rate.price;
        });
      });
      // Couriers that reach the most orders first, then the cheapest
      options.sort(function (a, b) {
        return Object.keys(b.prices).length - Object.keys(a.prices).length || a.total - b.total;
      });

      options.forEach(function (option, index) {
        var count = Object.keys(option.prices).length;
        var row = el('label', 'ship__rate');
        var radio = el('input');
        radio.type = 'radio';
        radio.name = 'bulk-rate';
        radio.value = String(index);
        radio.checked = index === 0;
        radio.addEventListener('change', update);
        var text = el('span', 'ship__rate-text');
        text.appendChild(el('strong', null, option.courier));
        var detail = /pick|drop/i.test(option.service) ? '' : DETAIL[option.detail];
        text.appendChild(el('span', null, [option.service, detail, option.delivery].filter(Boolean).join(' · ')));
        text.appendChild(el('span', null, count === targets.length ? 'All ' + plural(count, 'order') : count + ' of ' + targets.length + ' orders'));
        row.appendChild(radio);
        row.appendChild(text);
        row.appendChild(el('span', 'ship__price', rm(option.total)));
        choices.appendChild(row);
      });
      update();
      if (!options.length) note.textContent = 'No courier can take these orders.';
    }

    var priced = 0;
    note.textContent = 'Getting courier prices… 0 of ' + targets.length;
    var signedOut = false;
    var credit = shipApi({ action: 'status' }).then(function (data) {
      if (data.connected) balance = data.balance;
    }, function () { /* credit is checked again by EasyParcel when booking */ });
    var prices = eachLimited(targets, 3, function (order) {
      if (signedOut) return Promise.resolve();
      return shipApi({ id: order.id, action: 'quote' }).then(function (data) {
        quotes[order.id] = { weight: data.weight, rates: data.rates };
      }, function (error) {
        if (error.status === 401) signedOut = true;
        quotes[order.id] = { error: error.message };
      }).then(function () {
        priced++;
        if (!options.length) note.textContent = 'Getting courier prices… ' + priced + ' of ' + targets.length;
      });
    });
    Promise.all([credit, prices]).then(function () {
      if (signedOut) {
        bulkDialog.close();
        return showLogin();
      }
      showOptions();
    });

    confirmButton.addEventListener('click', function () {
      var option = chosen();
      if (!option) return;
      var ids = targets.filter(function (order) { return order.id in option.prices; });
      if (!window.confirm('Book ' + option.courier + ' for ' + plural(ids.length, 'order') + ', ' + rm(option.total) + ' in total? It is paid from your EasyParcel credit straight away.')) return;

      bulkBusy = true;
      renderBulk();
      confirmButton.disabled = true;
      cancel.disabled = true;
      choices.disabled = true;
      date.disabled = true;
      var booked = [];
      var failed = [];
      var stop = '';
      var index = 0;

      function bookNext() {
        if (index >= ids.length) return Promise.resolve();
        var order = ids[index++];
        if (stop) {
          failed.push(orderLabel(order) + ': not booked (' + stop + ')');
          return bookNext();
        }
        note.textContent = 'Booking ' + index + ' of ' + ids.length + '…';
        return shipApi({ id: order.id, action: 'book', serviceId: option.serviceId, weight: quotes[order.id].weight, collectDate: date.value }).then(function () {
          booked.push(order.id);
        }, function (error) {
          if (error.status === 401) stop = 'signed out';
          // Without credit the rest would be refused too
          else if (/credit/i.test(error.message)) stop = 'not enough EasyParcel credit';
          failed.push(orderLabel(order) + ': ' + error.message);
        }).then(bookNext);
      }

      bookNext().then(function () {
        bulkBusy = false;
        // Keep the booked orders ticked, ready for Print AWB
        selected = {};
        booked.forEach(function (id) { selected[id] = true; });
        title.textContent = booked.length ? 'Couriers booked' : 'Nothing booked';
        intro.hidden = true;
        choices.hidden = true;
        dateRow.hidden = true;
        confirmButton.remove();
        cancel.disabled = false;
        cancel.textContent = 'Done';
        note.textContent = plural(booked.length, 'order') + ' booked with ' + option.courier + '.' +
          (booked.length ? ' Press Print AWB to print all the labels.' : '');
        fillIssues(issues, failed.length ? ['Not booked:'].concat(failed) : []);
        bulkDialog.addEventListener('close', function () {
          if (stop === 'signed out') return showLogin();
          load(booked.length ? plural(booked.length, 'courier') + ' booked. The booked orders are still ticked: press Print AWB to print all their labels.' : '');
        }, { once: true });
      });
    });
  }

  /* Print AWB: one PDF with every selected order's A6 label, opened in a new tab to print */
  var pdfLib = null;

  function loadPdfLib() {
    if (!pdfLib) {
      pdfLib = new Promise(function (resolve, reject) {
        var script = document.createElement('script');
        script.src = '/admin/vendor/pdf-lib-1.17.1.min.js';
        script.onload = function () { resolve(window.PDFLib); };
        script.onerror = function () {
          pdfLib = null;
          reject(new Error('Couldn\u2019t load the PDF tool. Check the internet connection and try again.'));
        };
        document.head.appendChild(script);
      });
    }
    return pdfLib;
  }

  function awbLink(order) {
    if (order.ep_awb_link) return Promise.resolve(order.ep_awb_link);
    // Some couriers issue the AWB a little after booking
    return shipApi({ id: order.id, action: 'refresh' }).then(function (data) {
      if (!data.awbLink) throw new Error('the AWB isn\u2019t ready yet, try again in a few minutes');
      order.ep_awb_link = data.awbLink;
      return data.awbLink;
    });
  }

  function fetchPdf(url) {
    return fetch(url, { credentials: 'omit', cache: 'no-store' }).then(function (res) {
      if (!res.ok) throw new Error('EasyParcel didn\u2019t send the AWB (' + res.status + ')');
      return res.arrayBuffer();
    });
  }

  bulkPrint.addEventListener('click', function () {
    var targets = selectedShown().filter(canPrint);
    if (!targets.length) return;
    // Open the tab now, while it still counts as a click (pop-up blockers)
    var tab = window.open('', '_blank');
    if (tab) tab.document.write('<title>AWB</title><p style="font:16px -apple-system,sans-serif;padding:24px">Preparing ' + plural(targets.length, 'AWB') + '…</p>');

    bulkBusy = true;
    renderBulk();
    showMessage('Preparing ' + plural(targets.length, 'AWB') + '…');
    var files = [];
    var skipped = [];
    eachLimited(targets, 3, function (order) {
      return awbLink(order).then(fetchPdf).then(function (bytes) {
        files.push({ order: order, bytes: bytes });
      }, function (error) {
        if (error.status === 401) throw error;
        skipped.push(order.id + ': ' + error.message);
      });
    }).then(function () {
      if (!files.length) throw new Error('No AWB could be printed. ' + skipped.join('; '));
      return loadPdfLib();
    }).then(function (PDFLib) {
      // Same order as the list on screen
      files.sort(function (a, b) { return targets.indexOf(a.order) - targets.indexOf(b.order); });
      return PDFLib.PDFDocument.create().then(function (merged) {
        return files.reduce(function (chain, file) {
          return chain.then(function () {
            return PDFLib.PDFDocument.load(file.bytes, { ignoreEncryption: true }).then(function (doc) {
              return merged.copyPages(doc, doc.getPageIndices());
            }).then(function (pages) {
              pages.forEach(function (page) { merged.addPage(page); });
            }, function () {
              skipped.push(file.order.id + ': the AWB file couldn\u2019t be read');
            });
          });
        }, Promise.resolve()).then(function () {
          if (!merged.getPageCount()) throw new Error('No AWB could be printed. ' + skipped.join('; '));
          return merged.save();
        });
      });
    }).then(function (bytes) {
      var url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      var printed = targets.length - skipped.length;
      if (tab && !tab.closed) tab.location.href = url;
      else {
        var link = document.createElement('a');
        link.href = url;
        link.download = 'AWB-' + malaysiaToday() + '.pdf';
        document.body.appendChild(link);
        link.click();
        link.remove();
      }
      setTimeout(function () { URL.revokeObjectURL(url); }, 60 * 1000);
      bulkBusy = false;
      render();
      showMessage(plural(printed, 'AWB') + ' opened in a new tab: print from there on the A6 label printer.' +
        (skipped.length ? ' Not included: ' + skipped.join('; ') + '.' : ''));
    }).catch(function (error) {
      if (tab) tab.close();
      bulkBusy = false;
      renderBulk();
      handleError(error);
    });
  });

  bulkShipped.addEventListener('click', function () {
    var targets = selectedShown();
    if (!targets.length) return;
    var unbooked = targets.filter(function (order) { return !order.ep_order_no; }).length;
    if (!window.confirm('Mark ' + plural(targets.length, 'order') + ' as shipped?' +
      (unbooked && easyparcel.enabled ? ' ' + unbooked + ' of them ' + (unbooked === 1 ? 'has' : 'have') + ' no courier booked.' : ''))) return;
    bulkBusy = true;
    renderBulk();
    var failed = [];
    eachLimited(targets, 3, function (order) {
      return api('POST', { id: order.id, action: 'shipped' }).then(null, function (error) {
        if (error.status === 401) throw error;
        failed.push(order.id);
      });
    }).then(function () {
      bulkBusy = false;
      load(plural(targets.length - failed.length, 'order') + ' marked as shipped.' + (failed.length ? ' Not changed: ' + failed.join(', ') + '.' : ''));
    }, function (error) {
      bulkBusy = false;
      handleError(error);
    });
  });

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
