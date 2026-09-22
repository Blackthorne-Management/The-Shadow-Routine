-- ============================================================================
-- Pace-adjusted bands for the live leaderboard.
--
-- Band color was doing two jobs. They're now separate:
--   band_per_category       strict % of the full weekly target. Drives punishments
--                           (finalize_week) and is only meaningful once the week closes.
--   pace_band_per_category  "on track given how much of the week has passed".
--                           Drives leaderboard dots and home progress colors.
-- ============================================================================

alter table public.weekly_scores
  add column pace_band_per_category jsonb not null default '{}';

create or replace function public.band_for(ratio numeric)
returns text language sql immutable as $$
  select case when ratio >= 0.8 then 'green' when ratio >= 0.6 then 'gray' else 'red' end;
$$;

-- elapsed = days of the week that count so far (0–7): days already ended,
-- plus today once the participant has logged it. So nobody is judged on a
-- day they haven't had the chance to log yet.
-- Yes/no goals use whole days owed: a 4x/week gym goal owes floor(4 × 1/7) = 0
-- workouts after day one, so a Monday rest day isn't "behind".
-- Returns null when nothing is owed yet (elapsed = 0), shown as a neutral dot.
create or replace function public.pace_band(actual numeric, target numeric, gtype public.goal_type, elapsed int)
returns text language sql immutable as $$
  select case
    when elapsed <= 0 then null
    when expected = 0 then 'green'
    else public.band_for(least(actual / expected, 1.0))
  end
  from (select case when gtype = 'percentage' then target * least(elapsed, 7) / 7.0
                    else floor(target * least(elapsed, 7) / 7.0) end as expected) x;
$$;

create or replace function public.compute_week(p_week date)
returns void language plpgsql security definer set search_path = public as $$
begin
  p_week := public.week_start(p_week);

  with participants as (
    select p.id,
           case when t.today > p_week + 6 then 7
                when t.today < p_week then 0
                else (t.today - p_week)
                     + (exists (select 1 from public.daily_entries d
                                where d.user_id = p.id and d.entry_date = t.today))::int
           end as elapsed
      from public.profiles p
      cross join lateral (select public.local_today(p.id) as today) t
     where p.role = 'participant' and p.status = 'active'
  ),
  per_goal as (
    select g.user_id, g.category, g.goal_type, g.target_value, g.category_point_max, p.elapsed,
           coalesce(sum(case when g.goal_type = 'percentage' then e.value_reported
                             when e.value_reported > 0 then 1
                             else 0 end), 0) as actual
      from public.goals g
      join participants p on p.id = g.user_id
      left join public.daily_entries e
             on e.goal_id = g.id and e.entry_date between p_week and p_week + 6
     where g.status = 'approved'
     group by g.id, p.elapsed
  ),
  banded as (
    select *,
           round(least(actual / target_value, 1.0) * category_point_max, 2) as points,
           least(actual / target_value, 1.0) as ratio,
           public.band_for(least(actual / target_value, 1.0)) as band,
           public.pace_band(actual, target_value, goal_type, elapsed) as pace
      from per_goal
  ),
  cat as (
    select user_id,
           jsonb_object_agg(category, jsonb_build_object(
             'points', points, 'actual', actual, 'target', target_value,
             'pct', round(ratio * 100), 'max', category_point_max,
             'band', band, 'pace_band', pace
           )) as category_scores,
           jsonb_object_agg(category, band) as bands,
           jsonb_object_agg(category, pace) as pace_bands,
           sum(points) as total_cat,
           count(*) filter (where band = 'green') as greens
      from banded
     group by user_id
  ),
  bonus as (
    select c.user_id, least(sum(ch.point_value), 49)::int as pts
      from public.bonus_completions c
      join public.bonus_challenges ch on ch.id = c.bonus_challenge_id
     where c.completed and ch.challenge_date between p_week and p_week + 6
     group by c.user_id
  ),
  ranked as (
    select cat.*, coalesce(b.pts, 0) as bonus_pts,
           cat.total_cat + coalesce(b.pts, 0) as total,
           rank() over (order by cat.total_cat + coalesce(b.pts, 0) desc, cat.greens desc) as rnk
      from cat left join bonus b on b.user_id = cat.user_id
  )
  insert into public.weekly_scores as ws
    (user_id, week_start_date, category_scores, total_category_points, bonus_points,
     total_points, band_per_category, pace_band_per_category, consistency_rank, is_top_this_week, updated_at)
  select user_id, p_week, category_scores, total_cat, bonus_pts,
         total, bands, pace_bands, rnk, (rnk = 1 and total > 0), now()
    from ranked
  on conflict (user_id, week_start_date) do update set
    category_scores        = excluded.category_scores,
    total_category_points  = excluded.total_category_points,
    bonus_points           = excluded.bonus_points,
    total_points           = excluded.total_points,
    band_per_category      = excluded.band_per_category,
    pace_band_per_category = excluded.pace_band_per_category,
    consistency_rank       = excluded.consistency_rank,
    is_top_this_week       = excluded.is_top_this_week,
    updated_at             = now()
  -- Skip no-op writes so page loads calling refresh_current_week() don't
  -- fire realtime events at every open leaderboard.
  where (ws.category_scores, ws.bonus_points, ws.pace_band_per_category, ws.consistency_rank, ws.is_top_this_week)
        is distinct from
        (excluded.category_scores, excluded.bonus_points, excluded.pace_band_per_category, excluded.consistency_rank, excluded.is_top_this_week);

  delete from public.weekly_scores ws
   where ws.week_start_date = p_week and not ws.finalized
     and not exists (select 1 from public.profiles p
                     where p.id = ws.user_id and p.role = 'participant' and p.status = 'active');
end $$;

revoke execute on function public.compute_week(date) from public, anon, authenticated;
