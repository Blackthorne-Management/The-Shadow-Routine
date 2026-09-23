import { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { addDays, formatWeek, localDate, weekStart } from '../lib/dates';
import LeaderboardList from '../components/LeaderboardList';
import { TopBar } from '../components/ui';
import { useViewCohorts } from '../lib/cohorts';

export default function Leaderboard() {
  const { profile } = useAuth();
  const thisWeek = weekStart(localDate(profile?.timezone ?? 'UTC'));
  const lastWeek = addDays(thisWeek, -7);
  const [week, setWeek] = useState(thisWeek);
  const [scope, setScope] = useState<'cohort' | 'global'>('cohort');
  const { choices, current, setPick, name, names } = useViewCohorts(profile);

  // Make sure the current week has rows (and fresh pace colors) on open.
  // Supabase builders are lazy: without .then() the request is never sent.
  // Any rows it writes reach the list through its realtime subscription.
  useEffect(() => { supabase.rpc('refresh_current_week').then(); }, []);

  return (
    <main className="screen with-tabs">
      <TopBar pill={week === thisWeek ? 'Live' : 'Final'} />
      <div className="card">
        <p className="eyebrow">{formatWeek(week)}</p>
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
          <button className={week === thisWeek ? 'on' : ''} onClick={() => setWeek(thisWeek)}>This week</button>
          <button className={week === lastWeek ? 'on' : ''} onClick={() => setWeek(lastWeek)}>Last week</button>
        </div>
      </div>
      <LeaderboardList week={week} meId={profile?.id} cohortId={scope === 'cohort' ? current : undefined} cohortNames={names} />
      <p className="legend small muted">
        {scope === 'cohort'
          ? `Your cohort, ranked among itself. Global ranks everyone across all cohorts. `
          : 'Everyone across all cohorts. '}
        Ranked by points out of 1,049. Ties go to whoever has more green categories. Mentors who join in show here unranked.
        Dots (gym · refraining · 3 customs) show pace this week, and final results once a week closes.
      </p>
    </main>
  );
}
