import { useState } from 'react';
import { useAuth } from '../lib/auth';
import { supabase, friendlyError } from '../lib/supabase';
import { describeTarget } from '../lib/goals';
import { ThemeIcon } from '../components/Icon';
import ReminderSettings from '../components/ReminderSettings';
import { Link } from 'react-router-dom';
import { ErrorText, TopBar } from '../components/ui';
import RankCard from '../components/RankCard';
import Emblem from '../components/Emblem';
import NotificationPrefs from '../components/NotificationPrefs';
import AppearanceSettings from '../components/AppearanceSettings';
import { isSuperAdmin, staffLabel } from '../lib/roles';
import MentorDuties from '../components/MentorDuties';
import MentorParticipation from '../components/MentorParticipation';

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
      {profile && (
        <section className="card profile-head">
          <div className="row gap">
            {profile.role === 'admin'
              ? <span className="level">{staffLabel(profile)}</span>
              : <Emblem level={profile.rank_level} sex={profile.sex} size={44} />}
            <div>
              <h1>{profile.display_name}</h1>
              <p className="muted small">@{profile.username}</p>
            </div>
          </div>
        </section>
      )}
      {profile?.role === 'participant' && (
        <RankCard points={Number(profile.cumulative_cycle_points ?? 0)} sex={profile.sex} />
      )}

      {isSuperAdmin(profile) && <MentorDuties />}
      {profile?.role === 'admin' && <MentorParticipation />}

      <section className="card">
        <h2>{profile?.role === 'admin' ? 'Push notifications' : 'Reminders & push'}</h2>
        <ReminderSettings showTime={profile?.role === 'participant'} />
      </section>

      <AppearanceSettings />

      <Link to="/how-it-works" className="list-row link-row">
        <span className="goal-icon sm"><span aria-hidden>?</span></span>
        <div className="grow"><strong style={{ fontWeight: 500 }}>How the app works</strong><p className="small muted">Colors, punishments, Gold Months, ranks, your mentor</p></div>
        <span aria-hidden>›</span>
      </Link>

      <section className="card" id="notifications">
        <h2>Notifications</h2>
        <p className="hint">Pick what you hear about. Each one shows in your inbox (the bell) and, with push on, on your phone.</p>
        <NotificationPrefs />
      </section>

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
                  {g.red_week_punishment && <p className="small muted">Red week: {g.red_week_punishment}</p>}
                  {g.gold_reward && <p className="small muted">Gold Month: {g.gold_reward}{g.three_gold_reward ? ` · 3 Gold: ${g.three_gold_reward}` : ''}</p>}
                </div>
              </li>
            ))}
          </ul>
          <p className="hint">Goals and consequences are locked once approved. Talk to your mentor to change one.</p>
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
