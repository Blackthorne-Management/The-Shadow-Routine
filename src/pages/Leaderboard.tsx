import { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { addDays, formatWeek, localDate, weekStart } from '../lib/dates';
import LeaderboardList from '../components/LeaderboardList';
import { PageHeader } from '../components/ui';

export default function Leaderboard() {
  const { profile } = useAuth();
  const thisWeek = weekStart(localDate(profile?.timezone ?? 'UTC'));
  const [week, setWeek] = useState(thisWeek);

  // Make sure the current week has rows even before anyone's checked in
  useEffect(() => { supabase.rpc('refresh_current_week'); }, []);

  const lastWeek = addDays(thisWeek, -7);

  return (
    <main className="screen with-tabs">
      <PageHeader subtitle={formatWeek(week)} title="Leaderboard" />
      <div className="seg wide">
        <button className={week === thisWeek ? 'on' : ''} onClick={() => setWeek(thisWeek)}>This week · live</button>
        <button className={week === lastWeek ? 'on' : ''} onClick={() => setWeek(lastWeek)}>Last week</button>
      </div>
      <LeaderboardList week={week} meId={profile?.id} />
      <p className="legend small muted">
        Ranked by points out of 1,049; ties go to whoever has more green categories.
        Dots: gym · refraining · custom 1–3.
      </p>
    </main>
  );
}
