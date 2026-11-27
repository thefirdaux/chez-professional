/*
 * Footer: keeps the copyright year current, shows a payment method's name if CHIP's logo
 * for it can't be loaded, and adds the floating WhatsApp button for enquiries (every page).
 */
(function () {
  var year = document.querySelector('[data-year]');
  if (year) year.textContent = new Date().getFullYear();

  document.querySelectorAll('.site-footer__method img').forEach(function (img) {
    function fallback() { img.parentNode.textContent = img.alt; }
    if (img.complete && !img.naturalWidth) fallback();
    else img.addEventListener('error', fallback);
  });

  // Floating WhatsApp button: opens a chat with the shop (+60 11-5950 0464) with a greeting typed in
  var WHATSAPP = '601159500464';
  var greeting = 'Hai Chez Professional, saya ingin bertanya tentang produk anda.';
  var button = document.createElement('a');
  button.className = 'wa-float';
  button.href = 'https://wa.me/' + WHATSAPP + '?text=' + encodeURIComponent(greeting);
  button.target = '_blank';
  button.rel = 'noopener';
  button.setAttribute('aria-label', 'Tanya kami di WhatsApp');
  button.innerHTML =
    '<svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true">' +
      '<path fill="#fff" d="M16 3.2C8.94 3.2 3.2 8.9 3.2 15.93c0 2.25.6 4.45 1.72 6.38L3.1 28.8l6.67-1.75a12.86 12.86 0 0 0 6.22 1.6h.01c7.06 0 12.8-5.7 12.8-12.73C28.8 8.9 23.06 3.2 16 3.2zm0 23.3h-.01a10.66 10.66 0 0 1-5.43-1.49l-.39-.23-3.96 1.04 1.06-3.85-.25-.4a10.5 10.5 0 0 1-1.63-5.64C5.39 10.1 10.15 5.37 16 5.37c5.85 0 10.61 4.73 10.61 10.56 0 5.83-4.76 10.57-10.61 10.57z"/>' +
      '<path fill="#fff" d="M21.83 18.05c-.32-.16-1.9-.93-2.19-1.04-.29-.11-.5-.16-.72.16-.21.32-.82 1.04-1.01 1.25-.18.21-.37.24-.69.08-.32-.16-1.35-.5-2.57-1.58-.95-.84-1.59-1.88-1.78-2.2-.19-.32-.02-.49.14-.65.14-.14.32-.37.48-.56.16-.19.21-.32.32-.53.11-.21.05-.4-.03-.56-.08-.16-.72-1.72-.98-2.36-.26-.62-.52-.53-.72-.54h-.61c-.21 0-.56.08-.85.4-.29.32-1.12 1.09-1.12 2.66 0 1.57 1.15 3.09 1.31 3.3.16.21 2.26 3.44 5.47 4.83.76.33 1.36.52 1.83.67.77.24 1.47.21 2.02.13.62-.09 1.9-.77 2.17-1.52.27-.75.27-1.38.19-1.52-.08-.13-.29-.21-.61-.37z"/>' +
    '</svg><span class="wa-float__label">Tanya kami</span>';
  document.body.appendChild(button);
})();
