import { useState } from 'react';
import { getThemePref, setThemePref, type ThemePref } from '../lib/theme';

const OPTIONS: { value: ThemePref; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export default function AppearanceSettings() {
  const [pref, setPref] = useState<ThemePref>(getThemePref);
  return (
    <section className="card">
      <div>
        <h2>Appearance</h2>
        <p className="hint">Light is the default. Dark is remembered on this device.</p>
      </div>
      <div className="seg" role="radiogroup" aria-label="Theme">
        {OPTIONS.map((o) => (
          <button key={o.value} role="radio" aria-checked={pref === o.value} className={pref === o.value ? 'on' : ''}
            onClick={() => { setPref(o.value); setThemePref(o.value); }}>
            {o.label}
          </button>
        ))}
      </div>
    </section>
  );
}
