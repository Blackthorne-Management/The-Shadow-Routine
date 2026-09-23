import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { supabase, friendlyError } from '../lib/supabase';
import { ErrorText } from './ui';

/** Mentor-only: check in alongside the cohort, scored but unranked. */
export default function MentorParticipation() {
  const { profile, goals, refresh } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!profile) return null;
  const on = profile.mentor_participates;
  const ready = goals.length === 5;

  async function toggle(next: boolean) {
    setBusy(true); setError('');
    const { error } = await supabase.rpc('set_mentor_participation', { p_on: next });
    setBusy(false);
    if (error) setError(friendlyError(error)); else refresh();
  }

  return (
    <section className="card">
      <label className="pref-row">
        <div className="grow">
          <h2>Join the cohort</h2>
          <p className="small muted">
            Set goals and check in like everyone else. You show on the leaderboard marked Mentor, with no rank:
            you can't win, and you get no punishments or rewards.
          </p>
        </div>
        <input type="checkbox" role="switch" className="switch" checked={on} disabled={busy}
          onChange={(e) => toggle(e.target.checked)} />
      </label>
      {on && (
        ready
          ? <div className="row gap"><Link to="/today" className="btn primary grow">Today</Link><Link to="/my-goals" className="btn grow">Edit my goals</Link></div>
          : <Link to="/my-goals" className="btn primary block">Set my 5 goals</Link>
      )}
      <ErrorText>{error}</ErrorText>
    </section>
  );
}
