/*
 * Footer payment logos: asks the order server which payment methods CHIP has switched on
 * and shows CHIP's logo for each. New methods (cards, e-wallets) appear by themselves.
 * If the server can't be reached, the plain-text list in the page stays.
 */
(function () {
  var year = document.querySelector('[data-year]');
  if (year) year.textContent = new Date().getFullYear();

  var list = document.querySelector('[data-payment-methods]');
  if (!list || !window.fetch) return;

  fetch('/api/payment-methods')
    .then(function (res) { return res.ok ? res.json() : null; })
    .then(function (data) {
      var methods = data && Array.isArray(data.methods) ? data.methods : [];
      if (!methods.length) return;
      var items = methods.map(function (method) {
        var li = document.createElement('li');
        li.className = 'site-footer__method';
        var logos = (method.logos || []).filter(function (url) { return /^https:\/\//.test(url); });
        if (!logos.length) {
          li.textContent = method.name;
          return li;
        }
        li.classList.add('site-footer__method--logo');
        li.title = method.name;
        logos.forEach(function (url, i) {
          var img = document.createElement('img');
          img.src = url;
          img.alt = i === 0 ? method.name : '';
          img.height = 24;
          img.loading = 'lazy';
          li.appendChild(img);
        });
        return li;
      });
      list.replaceChildren.apply(list, items);
    })
    .catch(function () {});
})();
