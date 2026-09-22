import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { CATEGORY_ORDER } from '../lib/goals';
import type { WeeklyScore } from '../lib/types';
import { BandDot, Empty } from './ui';
import { Icon } from './Icon';

interface Row extends WeeklyScore { name: string; move: number }

/** Ranked list for one week; updates live via Supabase Realtime. */
export default function LeaderboardList({ week, meId }: { week: string; meId?: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const prevRanks = useRef<Map<string, number>>(new Map());

  const load = useCallback(async () => {
    const [{ data: scores }, { data: people }] = await Promise.all([
      supabase.from('weekly_scores').select('*').eq('week_start_date', week)
        .order('consistency_rank', { ascending: true }),
      supabase.from('profiles').select('id,display_name').eq('role', 'participant'),
    ]);
    const names = new Map((people ?? []).map((p) => [p.id as string, p.display_name as string]));
    const next = ((scores as WeeklyScore[]) ?? []).map((s) => {
      const before = prevRanks.current.get(s.user_id);
      const move = before && s.consistency_rank ? before - s.consistency_rank : 0;
      return { ...s, name: names.get(s.user_id) ?? 'Unknown', move };
    });
    prevRanks.current = new Map(next.map((r) => [r.user_id, r.consistency_rank ?? 0]));
    setRows(next);
  }, [week]);

  useEffect(() => {
    prevRanks.current = new Map();
    load();
    const ch = supabase.channel(`board-${week}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'weekly_scores', filter: `week_start_date=eq.${week}` },
        () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [week, load]);

  if (!rows) return <div className="skeleton-list" />;
  if (rows.length === 0) return <Empty>No scores yet this week. The first check-in puts you on the board.</Empty>;

  return (
    <ol className="board">
      {rows.map((r) => {
        // Open week: pace-adjusted dots (motivational). Closed week: the
        // strict final bands that decided punishments.
        const dots = r.finalized ? r.band_per_category : r.pace_band_per_category ?? r.band_per_category;
        return (
          <li key={r.user_id} className={`board-row ${r.is_top_this_week ? 'top' : ''} ${r.user_id === meId ? 'me' : ''}`}>
            <span className="board-rank">{r.consistency_rank}</span>
            <div className="board-main">
              <div className="board-name">
                {r.name}
                {r.user_id === meId && <span className="you">you</span>}
                {r.is_top_this_week && <span className="level">Most consistent</span>}
              </div>
              <div className="board-dots">
                {CATEGORY_ORDER.map((c) => <BandDot key={c} band={dots?.[c]} />)}
                {r.bonus_points > 0 && <span className="bonus-chip"><Icon name="bolt" size={13} />{r.bonus_points}</span>}
              </div>
            </div>
            <div className="board-pts">
              {Math.round(Number(r.total_points))}
              {r.move !== 0 && (
                <span key={`${r.consistency_rank}`} className={`move ${r.move > 0 ? 'up' : 'down'}`}>
                  {r.move > 0 ? `▲${r.move}` : `▼${-r.move}`}
                </span>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
