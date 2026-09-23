import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { CATEGORY_ORDER } from '../lib/goals';
import type { WeeklyScore } from '../lib/types';
import { BandDot, Empty } from './ui';
import { Icon } from './Icon';
import Emblem from './Emblem';
import type { Sex } from '../lib/types';

interface Row extends WeeklyScore { name: string; move: number; sex: Sex | null; rank_level: number; mentor: boolean }

/** Ranked list for one week; updates live via Supabase Realtime. */
export default function LeaderboardList({ week, meId }: { week: string; meId?: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const prevRanks = useRef<Map<string, number>>(new Map());

  const load = useCallback(async () => {
    const [{ data: scores }, { data: people }] = await Promise.all([
      supabase.from('weekly_scores').select('*').eq('week_start_date', week)
        .order('consistency_rank', { ascending: true }),
      supabase.from('profiles').select('id,display_name,sex,rank_level,role'),
    ]);
    const byId = new Map((people ?? []).map((p) => [p.id as string, p as { display_name: string; sex: Sex | null; rank_level: number; role: string }]));
    const next = ((scores as WeeklyScore[]) ?? []).map((s) => {
      const before = prevRanks.current.get(s.user_id);
      const move = before && s.consistency_rank ? before - s.consistency_rank : 0;
      const p = byId.get(s.user_id);
      return { ...s, name: p?.display_name ?? 'Unknown', sex: p?.sex ?? null, rank_level: p?.rank_level ?? 1, move, mentor: p?.role === 'admin' };
    })
      // Points order, so a participating mentor sits where their score puts them (unranked)
      .sort((x, y) => Number(y.total_points) - Number(x.total_points) || (x.consistency_rank ?? 99) - (y.consistency_rank ?? 99));
    prevRanks.current = new Map(next.filter((r) => r.consistency_rank).map((r) => [r.user_id, r.consistency_rank!]));
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
            <span className="board-rank">{r.mentor ? '–' : r.consistency_rank}</span>
            <div className="board-main">
              <div className="board-name">
                {r.mentor ? <span className="level">Mentor</span> : <Emblem level={r.rank_level} sex={r.sex} size={22} />}
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
