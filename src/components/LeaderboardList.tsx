import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { CATEGORY_ORDER } from '../lib/goals';
import type { WeeklyScore } from '../lib/types';
import { BandDot, Empty } from './ui';
import { Icon } from './Icon';
import Emblem from './Emblem';
import type { Sex } from '../lib/types';

interface Row extends WeeklyScore { name: string; move: number; sex: Sex | null; rank_level: number; mentor: boolean; cohort: string | null; rank: number | null; top: boolean }

const greens = (r: WeeklyScore) => Object.values(r.band_per_category ?? {}).filter((b) => b === 'green').length;

/**
 * Ranked list for one week; updates live via Supabase Realtime.
 * With `cohortId`: only that cohort, ranked among themselves (same rules:
 * points, then more green categories). Without: everyone, the global ranking.
 */
export default function LeaderboardList({ week, meId, cohortId, cohortNames }: {
  week: string; meId?: string; cohortId?: string | null; cohortNames?: Map<string, string>;
}) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const prevRanks = useRef<Map<string, number>>(new Map());

  const load = useCallback(async () => {
    const [{ data: scores }, { data: people }] = await Promise.all([
      supabase.from('weekly_scores').select('*').eq('week_start_date', week)
        .order('consistency_rank', { ascending: true }),
      supabase.from('profiles').select('id,display_name,sex,rank_level,role,cohort_id'),
    ]);
    type P = { display_name: string; sex: Sex | null; rank_level: number; role: string; cohort_id: string | null };
    const byId = new Map((people ?? []).map((p) => [p.id as string, p as P]));
    let list = ((scores as WeeklyScore[]) ?? []).map((s) => {
      const p = byId.get(s.user_id);
      return {
        ...s, name: p?.display_name ?? 'Unknown', sex: p?.sex ?? null, rank_level: p?.rank_level ?? 1,
        mentor: p?.role === 'admin', cohort: p?.cohort_id ?? null, move: 0,
        rank: s.consistency_rank, top: s.is_top_this_week,
      };
    });
    if (cohortId !== undefined) {
      // Cohort board: re-rank among this cohort's participants (mentors stay unranked)
      list = list.filter((r) => r.cohort === cohortId);
      const ranked = list.filter((r) => !r.mentor)
        .sort((x, y) => Number(y.total_points) - Number(x.total_points) || greens(y) - greens(x));
      ranked.forEach((r, i) => {
        const prev = ranked[i - 1];
        r.rank = prev && Number(prev.total_points) === Number(r.total_points) && greens(prev) === greens(r) ? prev.rank : i + 1;
        r.top = r.rank === 1 && Number(r.total_points) > 0;
      });
      list.filter((r) => r.mentor).forEach((r) => { r.rank = null; r.top = false; });
    }
    const next = list.map((r) => {
      const before = prevRanks.current.get(r.user_id);
      return { ...r, move: before && r.rank ? before - r.rank : 0 };
    })
      // Points order, so a participating mentor sits where their score puts them (unranked)
      .sort((x, y) => Number(y.total_points) - Number(x.total_points) || (x.rank ?? 99) - (y.rank ?? 99));
    prevRanks.current = new Map(next.filter((r) => r.rank).map((r) => [r.user_id, r.rank!]));
    setRows(next);
  }, [week, cohortId]);

  useEffect(() => {
    prevRanks.current = new Map();
    load();
    const ch = supabase.channel(`board-${week}-${cohortId ?? 'all'}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'weekly_scores', filter: `week_start_date=eq.${week}` },
        () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [week, cohortId, load]);

  if (!rows) return <div className="skeleton-list" />;
  if (rows.length === 0) return <Empty>No scores yet this week. The first check-in puts you on the board.</Empty>;

  return (
    <ol className="board">
      {rows.map((r) => {
        // Open week: pace-adjusted dots (motivational). Closed week: the
        // strict final bands that decided punishments.
        const dots = r.finalized ? r.band_per_category : r.pace_band_per_category ?? r.band_per_category;
        return (
          <li key={r.user_id} className={`board-row ${r.top ? 'top' : ''} ${r.user_id === meId ? 'me' : ''}`}>
            <span className="board-rank">{r.mentor || !r.rank ? '–' : r.rank}</span>
            <div className="board-main">
              <div className="board-name">
                {r.mentor ? <span className="level">Mentor</span> : <Emblem level={r.rank_level} sex={r.sex} size={22} />}
                {r.name}
                {r.user_id === meId && <span className="you">you</span>}
                {r.top && <span className="level">{cohortId !== undefined ? 'Top of cohort' : 'Most consistent'}</span>}
                {cohortId === undefined && cohortNames && cohortNames.size > 1 && r.cohort && (
                  <span className="small muted">{cohortNames.get(r.cohort)}</span>
                )}
              </div>
              <div className="board-dots">
                {CATEGORY_ORDER.map((c) => <BandDot key={c} band={dots?.[c]} />)}
                {r.bonus_points > 0 && <span className="bonus-chip"><Icon name="bolt" size={13} />{r.bonus_points}</span>}
              </div>
            </div>
            <div className="board-pts">
              {Math.round(Number(r.total_points))}
              {r.move !== 0 && (
                <span key={`${r.rank}`} className={`move ${r.move > 0 ? 'up' : 'down'}`}>
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
