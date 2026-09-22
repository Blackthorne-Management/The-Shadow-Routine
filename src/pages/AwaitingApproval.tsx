import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { THEME_ICONS, describeTarget } from '../lib/goals';
import { PageHeader } from '../components/ui';

export default function AwaitingApproval() {
  const { profile, goals, refresh, signOut } = useAuth();

  // Flip to the app the moment the admin approves.
  useEffect(() => {
    if (!profile) return;
    const ch = supabase
      .channel('await-approval')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'goals', filter: `user_id=eq.${profile.id}` }, () => refresh())
      .subscribe();
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => { supabase.removeChannel(ch); window.removeEventListener('focus', onFocus); };
  }, [profile, refresh]);

  return (
    <main className="screen">
      <PageHeader subtitle="Step 2 of 2" title="Waiting on approval"
        right={<button className="link" onClick={signOut}>Sign out</button>} />
      <div className="card hero-card">
        <div className="hourglass" aria-hidden>⏳</div>
        <p>Your mentor is reviewing your goals. You'll be able to start checking in as soon as they're approved.</p>
      </div>
      <h2 className="section-title">What you proposed</h2>
      <ul className="list">
        {goals.map((g) => (
          <li key={g.id} className="list-row">
            <span className="goal-icon">{THEME_ICONS[g.theme]}</span>
            <div className="grow">
              <strong>{g.label}</strong>
              <p className="muted small">{describeTarget(g)}</p>
            </div>
          </li>
        ))}
      </ul>
      <div className="row gap">
        <Link to="/goals" className="btn ghost grow">Edit proposal</Link>
        <button className="btn ghost grow" onClick={refresh}>Check again</button>
      </div>
    </main>
  );
}
