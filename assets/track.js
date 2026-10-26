/* Counts a page view for the admin analytics. No cookies, nothing stored in the browser. */
(function () {
  if (navigator.doNotTrack === '1' || /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return;
  var data = JSON.stringify({
    path: location.pathname,
    ref: document.referrer || '',
    utm: new URLSearchParams(location.search).get('utm_source') || ''
  });
  try {
    if (navigator.sendBeacon && navigator.sendBeacon('/api/track', new Blob([data], { type: 'application/json' }))) return;
  } catch (e) { /* fall back to fetch */ }
  fetch('/api/track', { method: 'POST', body: data, headers: { 'Content-Type': 'application/json' }, keepalive: true }).catch(function () {});
})();
