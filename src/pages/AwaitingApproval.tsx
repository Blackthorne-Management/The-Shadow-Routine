import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { describeTarget } from '../lib/goals';
import { TopBar } from '../components/ui';
import { Icon, ThemeIcon } from '../components/Icon';

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
      <TopBar pill="Step 2 of 2" />
      <div className="linked">
        <section className="card hero-card">
          <span className="spin-slow"><Icon name="hourglass" size={32} /></span>
          <h1>Waiting on approval</h1>
        </section>
        <section className="card">
          <p className="muted">Your mentor is reviewing your goals. You'll be able to start checking in as soon as they're approved.</p>
        </section>
      </div>
      <h2 className="section-title">What you proposed</h2>
      <ul className="list">
        {goals.map((g) => (
          <li key={g.id} className="list-row">
            <span className="goal-icon sm"><ThemeIcon theme={g.theme} /></span>
            <div className="grow">
              <strong style={{ fontWeight: 500 }}>{g.label}</strong>
              <p className="muted small">{describeTarget(g)}</p>
            </div>
          </li>
        ))}
      </ul>
      <div className="row gap">
        <Link to="/goals" className="btn grow">Edit proposal</Link>
        <button className="btn primary grow" onClick={refresh}>Check again</button>
      </div>
      <div className="center-text">
        <button className="link muted" onClick={signOut}>Sign out</button>
      </div>
    </main>
  );
}
