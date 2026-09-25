// Light / dark theme. Light is the default; dark is the alternative, chosen in
// Me → Appearance and remembered on this device. theme-init.js applies it
// before first paint to avoid a flash.
//
// The storage key is versioned: bumping it resets everyone to the default
// (it went to 'theme-v2' when light became the default for all).
export type ThemePref = 'light' | 'dark';
export const THEME_KEY = 'theme-v2';

export function getThemePref(): ThemePref {
  try { return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light'; } catch { return 'light'; }
}

export function applyTheme(pref: ThemePref = getThemePref()) {
  document.documentElement.dataset.theme = pref;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', pref === 'light' ? '#ebe5d8' : '#000000');
}

export function setThemePref(pref: ThemePref) {
  try {
    if (pref === 'light') localStorage.removeItem(THEME_KEY); else localStorage.setItem(THEME_KEY, pref);
    localStorage.removeItem('theme'); // the old key (phone-matching era)
  } catch { /* private mode */ }
  applyTheme(pref);
}
