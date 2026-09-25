// Theme before first paint: light unless this device chose dark in
// Me > Appearance. A file (not inline) so the Content-Security-Policy can
// forbid inline scripts. Keep the key in sync with src/lib/theme.ts.
(function () {
  var dark = false; try { dark = localStorage.getItem('theme-v2') === 'dark'; } catch (e) {}
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  if (dark) {
    document.querySelector('meta[name="theme-color"]').setAttribute('content', '#000000');
    document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]').setAttribute('content', 'black-translucent');
  }
})();
