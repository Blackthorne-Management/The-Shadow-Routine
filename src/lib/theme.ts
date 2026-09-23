// Light / dark theme. The choice lives on this device (localStorage); "system"
// follows the phone. index.html applies it before first paint to avoid a flash.
export type ThemePref = 'system' | 'light' | 'dark';
const KEY = 'theme';
const media = () => window.matchMedia('(prefers-color-scheme: light)');

export function getThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch { return 'system'; }
}

export function applyTheme(pref: ThemePref = getThemePref()) {
  const theme = pref === 'system' ? (media().matches ? 'light' : 'dark') : pref;
  const root = document.documentElement;
  root.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#ebe5d8' : '#000000');
}

export function setThemePref(pref: ThemePref) {
  try { if (pref === 'system') localStorage.removeItem(KEY); else localStorage.setItem(KEY, pref); } catch { /* private mode */ }
  applyTheme(pref);
}

/** Keep "system" in sync when the phone switches light/dark. */
export function watchSystemTheme() {
  media().addEventListener('change', () => { if (getThemePref() === 'system') applyTheme('system'); });
}
