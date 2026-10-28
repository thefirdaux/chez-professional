/*
 * Footer: keeps the copyright year current, and shows a payment method's name
 * if CHIP's logo for it can't be loaded.
 */
(function () {
  var year = document.querySelector('[data-year]');
  if (year) year.textContent = new Date().getFullYear();

  document.querySelectorAll('.site-footer__method img').forEach(function (img) {
    function fallback() { img.parentNode.textContent = img.alt; }
    if (img.complete && !img.naturalWidth) fallback();
    else img.addEventListener('error', fallback);
  });
})();
