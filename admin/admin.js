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

  function rm(sen) {
    return 'RM ' + (sen / 100).toFixed(2);
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

      list.appendChild(item);
    });
    updateToolbar();
  }

  function load() {
    showMessage('Loading…');
    api('GET').then(function (data) {
      showApp();
      showMessage('');
      orders = data.orders;
      render();
    }, function (error) {
      orders = [];
      render();
      handleError(error);
    });
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

  load();
})();
