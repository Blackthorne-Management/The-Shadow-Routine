import { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { formatWeek, localDate, weekStart } from '../lib/dates';
import LeaderboardList, { OverallList } from '../components/LeaderboardList';
import { TopBar } from '../components/ui';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { useViewCohorts } from '../lib/cohorts';

export default function Leaderboard() {
  const { profile } = useAuth();
  const thisWeek = weekStart(localDate(profile?.timezone ?? 'UTC'));
  const [period, setPeriod] = useState<'week' | 'overall'>('week');
  const [scope, setScope] = useState<'cohort' | 'global'>('cohort');
  const { choices, current, setPick, name, names } = useViewCohorts(profile);

  // Make sure the current week has rows (and fresh pace colors) on open.
  // Supabase builders are lazy: without .then() the request is never sent.
  // Any rows it writes reach the list through its realtime subscription.
  useEffect(() => { supabase.rpc('refresh_current_week').then(); }, []);

  return (
    <main className="screen with-tabs">
      <TopBar pill="Live" />
      <Link to="/ultimate" className="ult-button"><Icon name="crown" size={18} /> The Ultimate Shadow</Link>
      <div className="card">
        <p className="eyebrow">{period === 'week' ? formatWeek(thisWeek) : 'The whole program so far'}</p>
        <h1>Leaderboard</h1>
        <div className="seg">
          <button className={scope === 'cohort' ? 'on' : ''} onClick={() => setScope('cohort')}>{name ?? 'Cohort'}</button>
          <button className={scope === 'global' ? 'on' : ''} onClick={() => setScope('global')}>Global</button>
        </div>
        {scope === 'cohort' && choices.length > 1 && (
          <select value={current ?? ''} onChange={(e) => setPick(e.target.value)} aria-label="Cohort">
            {choices.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        <div className="seg">
          <button className={period === 'week' ? 'on' : ''} onClick={() => setPeriod('week')}>This week</button>
          <button className={period === 'overall' ? 'on' : ''} onClick={() => setPeriod('overall')}>Overall</button>
        </div>
      </div>
      {period === 'week'
        ? <LeaderboardList week={thisWeek} meId={profile?.id} cohortId={scope === 'cohort' ? current : undefined} cohortNames={names} />
        : <OverallList meId={profile?.id} cohortId={scope === 'cohort' ? current : undefined} cohortNames={names} />}
      <p className="legend small muted">
        {scope === 'cohort'
          ? `Your cohort, ranked among itself. Global ranks everyone across all cohorts. `
          : 'Everyone across all cohorts. '}
        {period === 'week'
          ? 'Ranked by points out of 1,049. Ties go to whoever has more green categories. Dots (workouts · refrain · reading · eating · custom) show pace this week, and final results once a week closes.'
          : 'Overall adds up every program week (max 10,490), the same total that sets your rank title.'}
        {' '}Mentors who join in show here unranked.
      </p>
    </main>
  );
}
