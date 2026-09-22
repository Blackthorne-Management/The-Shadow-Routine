import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { formatWeek, localDate, timeAgo, weekStart } from '../../lib/dates';
import LeaderboardList from '../../components/LeaderboardList';
import { Empty } from '../../components/ui';

interface FeedItem { user_id: string; entry_date: string; at: string; name: string; yes: number; total: number }

export default function Overview() {
  const { profile } = useAuth();
  const week = weekStart(localDate(profile?.timezone ?? 'UTC'));
  const [feed, setFeed] = useState<FeedItem[] | null>(null);

  // One feed item per person per day (a check-in writes 5 entries)
  const loadFeed = useCallback(async () => {
    const [{ data: entries }, { data: people }] = await Promise.all([
      supabase.from('daily_entries').select('user_id,entry_date,value_reported,updated_at')
        .order('updated_at', { ascending: false }).limit(250),
      supabase.from('profiles').select('id,display_name'),
    ]);
    const names = new Map((people ?? []).map((p) => [p.id, p.display_name]));
    const byKey = new Map<string, FeedItem>();
    for (const e of entries ?? []) {
      const k = `${e.user_id}|${e.entry_date}`;
      const item = byKey.get(k) ?? { user_id: e.user_id, entry_date: e.entry_date, at: e.updated_at, name: names.get(e.user_id) ?? '?', yes: 0, total: 0 };
      item.total += 1;
      if (Number(e.value_reported) > 0) item.yes += 1;
      if (e.updated_at > item.at) item.at = e.updated_at;
      byKey.set(k, item);
    }
    setFeed([...byKey.values()].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 30));
  }, []);

  useEffect(() => {
    supabase.rpc('refresh_current_week').then(); // lazy builder: .then() sends it
    loadFeed();
    const ch = supabase.channel('admin-feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_entries' }, () => loadFeed())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [loadFeed]);

  return (
    <>
      <h2 className="section-title">Leaderboard · {formatWeek(week)}</h2>
      <LeaderboardList week={week} />

      <h2 className="section-title">Live check-ins</h2>
      {!feed ? <div className="skeleton-list" /> : feed.length === 0 ? <Empty>No check-ins yet.</Empty> : (
        <ul className="list">
          {feed.map((f) => (
            <li key={`${f.user_id}${f.entry_date}`} className="list-row">
              <span className="avatar">{f.name.slice(0, 1).toUpperCase()}</span>
              <div className="grow">
                <strong>{f.name}</strong>
                <p className="small muted">Logged {f.entry_date} · {f.yes}/{f.total} goals with progress</p>
              </div>
              <span className="small muted">{timeAgo(f.at)}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
