import { useState } from 'react';
import { useAuth } from '../lib/auth';
import { supabase, friendlyError } from '../lib/supabase';
import { browserTimezone } from '../lib/dates';
import {
  isIOS, needsInstallForPush, pushSupported, showTestNotification, subscribeToPush, unsubscribeFromPush,
} from '../lib/push';
import { ErrorText } from './ui';
import { Icon } from './Icon';

/** Reminder time + push permission. Saves to notification_settings. */
/** showTime=false: push on/off only (the mentor has no nightly reminder). */
export default function ReminderSettings({ onSaved, showTime = true }: { onSaved?: () => void; showTime?: boolean }) {
  const { profile, notif, refresh } = useAuth();
  const [time, setTime] = useState((notif?.reminder_time ?? '21:00').slice(0, 5));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const tz = browserTimezone();
  const pushOn = Boolean(notif?.enabled && notif?.push_subscription);

  async function save(patch: Partial<{ enabled: boolean; push_subscription: PushSubscriptionJSON | null }> = {}) {
    if (!profile) return;
    setError(''); setMsg(''); setBusy(true);
    const { error } = await supabase.from('notification_settings').upsert({
      user_id: profile.id,
      reminder_time: time,
      timezone: tz,
      enabled: patch.enabled ?? notif?.enabled ?? false,
      push_subscription: patch.push_subscription !== undefined ? patch.push_subscription : notif?.push_subscription ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
    // Day boundaries (what counts as "today") follow the same timezone
    if (!error && profile.timezone !== tz) await supabase.from('profiles').update({ timezone: tz }).eq('id', profile.id);
    setBusy(false);
    if (error) { setError(friendlyError(error)); return false; }
    await refresh();
    setMsg('Saved.');
    onSaved?.();
    return true;
  }

  async function enablePush() {
    setError('');
    try {
      const sub = await subscribeToPush();
      if (await save({ enabled: true, push_subscription: sub })) await showTestNotification();
    } catch (e) {
      setError(friendlyError(e));
    }
  }

  async function disablePush() {
    await unsubscribeFromPush();
    await save({ enabled: false, push_subscription: null });
  }

  return (
    <div className="stack">
      {showTime && (
        <>
          <label className="field">
            <span>Nightly reminder</span>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </label>
          <p className="hint">Timezone: {tz} (detected from this device)</p>
        </>
      )}

      {needsInstallForPush() ? (
        <InstallSteps />
      ) : !pushSupported() ? (
        <p className="notice">This browser can't receive push notifications. {isIOS() ? 'Update to iOS 16.4 or later.' : ''}</p>
      ) : pushOn ? (
        <div className="row gap">
          <span className="pill green"><Icon name="bell" size={13} /> Notifications on</span>
          <button className="link" onClick={disablePush} disabled={busy}>Turn off</button>
        </div>
      ) : (
        <button className="btn primary block" onClick={enablePush} disabled={busy}><Icon name="bell" size={16} /> Turn on push notifications</button>
      )}

      <ErrorText>{error}</ErrorText>
      {msg && <p className="success">{msg}</p>}
      {showTime && <button className="btn block" onClick={() => save()} disabled={busy}>Save reminder time</button>}
    </div>
  );
}

export function InstallSteps() {
  return (
    <div className="notice">
      <strong>First, add the app to your Home Screen</strong>
      <p>iPhone only allows notifications for apps on your Home Screen:</p>
      <ol className="steps">
        <li>Tap the <b>Share</b> button <span aria-hidden>⬆︎</span> in Safari's toolbar</li>
        <li>Choose <b>Add to Home Screen</b></li>
        <li>Open <b>Shadow</b> from your Home Screen and come back here</li>
      </ol>
    </div>
  );
}
