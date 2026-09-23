import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { supabase, friendlyError } from '../lib/supabase';
import { isSuperAdmin } from '../lib/roles';
import { useCohorts } from '../lib/cohorts';
import { ErrorText } from './ui';

/**
 * Which cohorts you mentor. Admins choose (none = Admin only); Mentors see the
 * cohorts an Admin assigned them.
 */
export default function MentorDuties() {
  const { profile, refresh } = useAuth();
  const { cohorts, load, mentoredBy } = useCohorts();
  const [error, setError] = useState('');
  if (!profile || !cohorts) return null;
  const admin = isSuperAdmin(profile);
  const mine = mentoredBy(profile.id);

  async function toggle(cohort: string, on: boolean) {
    setError('');
    const { error } = await supabase.rpc('set_cohort_mentor', { p_cohort: cohort, p_user: profile!.id, p_on: on });
    if (error) setError(friendlyError(error)); else { await load(); refresh(); }
  }

  return (
    <section className="card">
      <div>
        <h2>Cohorts you mentor</h2>
        <p className="small muted">
          {admin
            ? "You get approvals, reviews and proof alerts for these cohorts. Mentor none to be an Admin only: you still see every cohort, and alerts from cohorts with no mentor still come to you."
            : 'You see and handle approvals, reviews and proof for these cohorts. An Admin assigns them.'}
        </p>
      </div>
      {admin ? cohorts.map((c) => (
        <label key={c.id} className="pref-row">
          <span className="grow">{c.name}</span>
          <input type="checkbox" role="switch" className="switch" checked={mine.includes(c.id)}
            onChange={(e) => toggle(c.id, e.target.checked)} />
        </label>
      )) : (
        <p>{mine.length ? cohorts.filter((c) => mine.includes(c.id)).map((c) => c.name).join(', ') : 'None yet. Ask an Admin to assign you a cohort.'}</p>
      )}
      {admin && <Link to="/admin/cohorts" className="link small">Manage cohorts</Link>}
      <ErrorText>{error}</ErrorText>
    </section>
  );
}
