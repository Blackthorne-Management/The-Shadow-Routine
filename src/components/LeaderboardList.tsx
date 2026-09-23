import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { CATEGORY_ORDER } from '../lib/goals';
import type { WeeklyScore } from '../lib/types';
import { rankRows } from '../lib/ranking';
import { titleFor } from '../lib/ranks';
import { BandDot, Empty } from './ui';
import { Icon } from './Icon';
import Emblem from './Emblem';
import type { Sex } from '../lib/types';

interface Row extends WeeklyScore { name: string; move: number; sex: Sex | null; rank_level: number; mentor: boolean; cohort: string | null; rank: number | null; top: boolean }

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
      const ranks = rankRows(list);
      list.forEach((r) => {
        r.rank = ranks.get(r.user_id) ?? null;
        r.top = r.rank === 1 && Number(r.total_points) > 0;
      });
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

interface OverallRow {
  id: string; display_name: string; sex: Sex | null; rank_level: number; role: string;
  cohort_id: string | null; cumulative_cycle_points: number; status: string; mentor_participates: boolean;
}

/**
 * The whole program so far: cycle points (every program week added up), the
 * same total that drives the 10 ranks. With `cohortId`: that cohort only.
 */
export function OverallList({ meId, cohortId, cohortNames }: {
  meId?: string; cohortId?: string | null; cohortNames?: Map<string, string>;
}) {
  const [rows, setRows] = useState<(OverallRow & { rank: number | null })[] | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from('profiles')
      .select('id,display_name,sex,rank_level,role,cohort_id,cumulative_cycle_points,status,mentor_participates');
    let list = ((data as OverallRow[]) ?? [])
      .filter((p) => p.status === 'active' && (p.role === 'participant' || p.mentor_participates));
    if (cohortId !== undefined) list = list.filter((p) => p.cohort_id === cohortId);
    list.sort((x, y) => Number(y.cumulative_cycle_points) - Number(x.cumulative_cycle_points) || x.display_name.localeCompare(y.display_name));
    // Ties share a rank; mentors who check in are shown but unranked
    let last: { pts: number; rank: number } | null = null, n = 0;
    setRows(list.map((p) => {
      if (p.role === 'admin') return { ...p, rank: null };
      n += 1;
      const pts = Number(p.cumulative_cycle_points);
      const rank = last && last.pts === pts ? last.rank : n;
      last = { pts, rank };
      return { ...p, rank };
    }));
  }, [cohortId]);

  useEffect(() => {
    load();
    const ch = supabase.channel(`overall-${cohortId ?? 'all'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'weekly_scores' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [cohortId, load]);

  if (!rows) return <div className="skeleton-list" />;
  if (rows.length === 0) return <Empty>No one on the board yet.</Empty>;

  return (
    <ol className="board">
      {rows.map((r) => (
        <li key={r.id} className={`board-row ${r.rank === 1 && Number(r.cumulative_cycle_points) > 0 ? 'top' : ''} ${r.id === meId ? 'me' : ''}`}>
          <span className="board-rank">{r.rank ?? '–'}</span>
          <div className="board-main">
            <div className="board-name">
              {r.role === 'admin' ? <span className="level">Mentor</span> : <Emblem level={r.rank_level} sex={r.sex} size={22} />}
              {r.display_name}
              {r.id === meId && <span className="you">you</span>}
              {cohortId === undefined && cohortNames && cohortNames.size > 1 && r.cohort_id && (
                <span className="small muted">{cohortNames.get(r.cohort_id)}</span>
              )}
            </div>
            <span className="small muted">{r.role === 'admin' ? 'Checks in with the cohort' : titleFor(r.rank_level, r.sex)}</span>
          </div>
          <div className="board-pts">{Math.round(Number(r.cumulative_cycle_points)).toLocaleString()}</div>
        </li>
      ))}
    </ol>
  );
}
