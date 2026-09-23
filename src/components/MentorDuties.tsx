import { useState } from 'react';
import { useAuth } from '../lib/auth';
import { supabase, friendlyError } from '../lib/supabase';
import { ErrorText } from './ui';

/** Admin only: also act as a mentor, or be an Admin only. */
export default function MentorDuties() {
  const { profile, refresh } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!profile) return null;

  async function toggle(next: boolean) {
    setBusy(true); setError('');
    const { error } = await supabase.rpc('set_is_mentor', { p_on: next });
    setBusy(false);
    if (error) setError(friendlyError(error)); else refresh();
  }

  return (
    <section className="card">
      <label className="pref-row">
        <div className="grow">
          <h2>I'm also a mentor</h2>
          <p className="small muted">
            On: you get mentor alerts (goal submissions, no-photo workouts, proof to review) and the to-do badge on your tab.
            Off: you're an Admin only. You keep every Admin tool, and Mentors get the alerts.
            If there are no Mentors, the alerts still come to you.
          </p>
        </div>
        <input type="checkbox" role="switch" className="switch" checked={profile.is_mentor} disabled={busy}
          onChange={(e) => toggle(e.target.checked)} />
      </label>
      <ErrorText>{error}</ErrorText>
    </section>
  );
}
