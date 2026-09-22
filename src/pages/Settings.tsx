import { useState } from 'react';
import { useAuth } from '../lib/auth';
import { supabase, friendlyError } from '../lib/supabase';
import { describeTarget } from '../lib/goals';
import { ThemeIcon } from '../components/Icon';
import ReminderSettings from '../components/ReminderSettings';
import { ErrorText, TopBar } from '../components/ui';

export default function Settings() {
  const { profile, goals, session, refresh, signOut } = useAuth();
  const [name, setName] = useState(profile?.display_name ?? '');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  async function saveName() {
    setError(''); setMsg('');
    const { error } = await supabase.from('profiles').update({ display_name: name.trim() }).eq('id', profile!.id);
    if (error) setError(friendlyError(error));
    else { setMsg('Name updated.'); refresh(); }
  }

  async function changePassword() {
    setError(''); setMsg('');
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    const { error } = await supabase.auth.updateUser({ password });
    if (error) setError(friendlyError(error));
    else { setMsg('Password changed.'); setPassword(''); }
  }

  return (
    <main className="screen with-tabs">
      <TopBar pill={`@${profile?.username}`} />

      {profile?.role === 'participant' && (
        <section className="card">
          <h2>Reminders</h2>
          <ReminderSettings />
        </section>
      )}

      {goals.length > 0 && (
        <section className="card">
          <h2>My goals</h2>
          <ul className="list plain">
            {goals.map((g) => (
              <li key={g.id} className="list-row">
                <span className="goal-icon sm"><ThemeIcon theme={g.theme} /></span>
                <div className="grow">
                  <strong>{g.label}</strong>
                  <p className="small muted">{describeTarget(g)} · {g.category_point_max} pts</p>
                </div>
              </li>
            ))}
          </ul>
          <p className="hint">Goals are locked once approved. Talk to your mentor to change one.</p>
        </section>
      )}

      <section className="card stack">
        <h2>Account</h2>
        <label className="field">
          <span>Display name</span>
          <div className="row gap">
            <input className="grow" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
            <button className="btn" onClick={saveName} disabled={!name.trim() || name === profile?.display_name}>Save</button>
          </div>
        </label>
        <label className="field">
          <span>New password</span>
          <div className="row gap">
            <input className="grow" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <button className="btn" onClick={changePassword} disabled={!password}>Change</button>
          </div>
        </label>
        <p className="hint">Signed in as {session?.user.email}</p>
        <ErrorText>{error}</ErrorText>
        {msg && <p className="success">{msg}</p>}
        <button className="btn block" onClick={signOut}>Sign out</button>
      </section>
    </main>
  );
}
