import { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { addDays, formatWeek, localDate, weekStart } from '../lib/dates';
import LeaderboardList from '../components/LeaderboardList';
import { TopBar } from '../components/ui';

export default function Leaderboard() {
  const { profile } = useAuth();
  const thisWeek = weekStart(localDate(profile?.timezone ?? 'UTC'));
  const lastWeek = addDays(thisWeek, -7);
  const [week, setWeek] = useState(thisWeek);

  // Make sure the current week has rows (and fresh pace colors) on open
  useEffect(() => { supabase.rpc('refresh_current_week'); }, []);

  return (
    <main className="screen with-tabs">
      <TopBar pill={week === thisWeek ? 'Live' : 'Final'} />
      <div className="card">
        <p className="eyebrow">{formatWeek(week)}</p>
        <h1>Leaderboard</h1>
        <div className="seg">
          <button className={week === thisWeek ? 'on' : ''} onClick={() => setWeek(thisWeek)}>This week</button>
          <button className={week === lastWeek ? 'on' : ''} onClick={() => setWeek(lastWeek)}>Last week</button>
        </div>
      </div>
      <LeaderboardList week={week} meId={profile?.id} />
      <p className="legend small muted">
        Ranked by points out of 1,049. Ties go to whoever has more green categories.
        Dots (gym · refraining · 3 customs) show pace this week, and final results once a week closes.
      </p>
    </main>
  );
}
