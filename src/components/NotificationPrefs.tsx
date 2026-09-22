import { useState } from 'react';
import { useAuth } from '../lib/auth';
import { supabase, friendlyError } from '../lib/supabase';
import { ADMIN_PREFS, PARTICIPANT_PREFS, prefOn } from '../lib/notifications';
import { browserTimezone } from '../lib/dates';
import { ErrorText } from './ui';

/** Per-type on/off switches, saved to notification_settings.prefs. */
export default function NotificationPrefs() {
  const { profile, notif, refresh } = useAuth();
  const defs = profile?.role === 'admin' ? ADMIN_PREFS : PARTICIPANT_PREFS;
  const [prefs, setPrefs] = useState<Record<string, boolean>>(notif?.prefs ?? {});
  const [error, setError] = useState('');

  async function toggle(key: string, on: boolean) {
    if (!profile) return;
    const next = { ...prefs, [key]: on };
    setPrefs(next); setError('');
    const { error } = await supabase.from('notification_settings').upsert(
      notif ? { user_id: profile.id, prefs: next, updated_at: new Date().toISOString() }
            : { user_id: profile.id, prefs: next, timezone: browserTimezone(), updated_at: new Date().toISOString() },
      { onConflict: 'user_id' });
    if (error) { setError(friendlyError(error)); setPrefs(prefs); return; }
    refresh();
  }

  return (
    <div className="stack tight">
      {defs.map((d) => {
        const on = prefOn(prefs, d);
        return (
          <label key={d.key} className="pref-row">
            <div className="grow">
              <span>{d.label}</span>
              <p className="small muted">{d.hint}</p>
            </div>
            <input type="checkbox" role="switch" className="switch" checked={on} onChange={(e) => toggle(d.key, e.target.checked)} />
          </label>
        );
      })}
      <ErrorText>{error}</ErrorText>
    </div>
  );
}
