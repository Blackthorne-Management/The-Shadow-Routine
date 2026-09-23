// Theme before first paint: Me > Appearance choice, else the phone's setting.
// A file (not inline) so the Content-Security-Policy can forbid inline scripts.
(function () {
  var p = null; try { p = localStorage.getItem('theme'); } catch (e) {}
  var light = p ? p === 'light' : matchMedia('(prefers-color-scheme: light)').matches;
  document.documentElement.dataset.theme = light ? 'light' : 'dark';
  if (light) {
    document.querySelector('meta[name="theme-color"]').setAttribute('content', '#ebe5d8');
    document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]').setAttribute('content', 'default');
  }
})();
