/*
 * Meta Pixel (Facebook and Instagram ads). Loads only when an ID is set on the admin's Settings page
 * (read from /api/site-config) and never on localhost. Sends PageView on every page; the pages send
 * ViewContent, AddToCart, InitiateCheckout and Purchase through window.chezPixel(name, params, options).
 *
 * options.eventID  lets Meta recognise the same event sent twice
 * options.once     a key; the event is sent only once on this browser (the Purchase uses the order number)
 */
(function () {
  var queue = [];
  var ready = false;
  var enabled = false;

  function sentBefore(key) {
    try { return !!localStorage.getItem('chez-pixel:' + key); } catch (e) { return false; }
  }

  function remember(key) {
    try { localStorage.setItem('chez-pixel:' + key, String(Date.now())); } catch (e) { /* ignore */ }
  }

  function send(name, params, options) {
    options = options || {};
    if (options.once && sentBefore(options.once)) return;
    window.fbq('track', name, params || {}, options.eventID ? { eventID: options.eventID } : undefined);
    if (options.once) remember(options.once);
  }

  window.chezPixel = function (name, params, options) {
    if (!ready) queue.push([name, params, options]);
    else if (enabled) send(name, params, options);
  };

  function finish(pixelId) {
    ready = true;
    enabled = !!pixelId;
    if (enabled) {
      /* Meta's standard base code */
      !function (f, b, e, v, n, t, s) {
        if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
        if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = [];
        t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
      }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
      window.fbq('init', pixelId);
      window.fbq('track', 'PageView');
      queue.forEach(function (event) { send(event[0], event[1], event[2]); });
    }
    queue = [];
  }

  if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return finish(null);
  fetch('/api/site-config')
    .then(function (res) { return res.ok ? res.json() : {}; })
    .then(function (config) { finish(config && config.metaPixelId); }, function () { finish(null); });
})();
