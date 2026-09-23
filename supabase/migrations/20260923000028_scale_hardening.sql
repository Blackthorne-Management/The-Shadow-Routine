-- ============================================================================
-- Holding up at 100+ people at once
--
--   1. compute_week runs one at a time per week (an advisory lock), so
--      simultaneous check-ins queue instead of colliding (lock waits/deadlocks
--      on the shared weekly_scores rows).
--   2. Opening Today/Board (refresh_current_week) only re-scores the week if it
--      hasn't been scored in the last minute. Check-ins still re-score at once.
--   3. Row-level security: auth.uid() is evaluated once per query, not per row
--      (the Supabase advisor's auth_rls_initplan fix).
--   4. Indexes on foreign keys and the hot lookup paths.
-- ============================================================================

-- When each week was last scored
create table public.score_refresh (
  week_start  date primary key,
  computed_at timestamptz not null default now()
);
alter table public.score_refresh enable row level security;  -- no policies: functions only

do $$
declare def text;
begin
  def := pg_get_functiondef('public.compute_week(date)'::regprocedure);
  if position(E'begin\n  p_week := public.week_start(p_week);' in def) = 0 then
    raise exception 'compute_week: pattern not found';
  end if;
  execute replace(def, E'begin\n  p_week := public.week_start(p_week);',
    E'begin\n  p_week := public.week_start(p_week);\n'
    '  -- One scoring run per week at a time; others wait their turn\n'
    '  perform pg_advisory_xact_lock(7331, p_week - date ''2000-01-01'');\n'
    '  insert into public.score_refresh (week_start, computed_at) values (p_week, now())\n'
    '  on conflict (week_start) do update set computed_at = excluded.computed_at;');
end $$;

create or replace function public.refresh_current_week()
returns date language plpgsql security definer set search_path = public as $$
declare
  v_week date := public.week_start(public.local_today(auth.uid()));
begin
  -- Scored in the last minute? Pace colours and ranks are fresh enough.
  if not exists (select 1 from public.score_refresh
                  where week_start = v_week and computed_at > now() - interval '60 seconds') then
    perform public.compute_week(v_week);
  end if;
  return v_week;
end $$;

-- auth.uid() once per query instead of once per row
do $$
declare
  r record;
  q text;
  c text;
begin
  for r in select * from pg_policies
            where schemaname = 'public'
              and (coalesce(qual, '') || coalesce(with_check, '')) like '%auth.uid()%'
              and (coalesce(qual, '') || coalesce(with_check, '')) not ilike '%select auth.uid()%' loop
    q := replace(r.qual, 'auth.uid()', '(select auth.uid())');
    c := replace(r.with_check, 'auth.uid()', '(select auth.uid())');
    execute format('alter policy %I on %I.%I %s %s', r.policyname, r.schemaname, r.tablename,
                   case when q is not null then 'using (' || q || ')' else '' end,
                   case when c is not null then 'with check (' || c || ')' else '' end);
  end loop;
end $$;

-- Foreign keys + hot paths
create index if not exists bonus_challenges_reviewed_by_idx    on public.bonus_challenges (reviewed_by);
create index if not exists bonus_completions_challenge_idx     on public.bonus_completions (bonus_challenge_id);
create index if not exists daily_entries_goal_idx              on public.daily_entries (goal_id);
create index if not exists dm_reads_other_idx                  on public.dm_reads (other_id);
create index if not exists goals_approved_by_idx               on public.goals (approved_by);
create index if not exists infractions_user_idx                on public.infractions (user_id);
create index if not exists invite_codes_cohort_idx             on public.invite_codes (cohort_id);
create index if not exists invite_codes_created_by_idx         on public.invite_codes (created_by);
create index if not exists invite_codes_used_by_idx            on public.invite_codes (used_by);
create index if not exists messages_user_idx                   on public.messages (user_id);
create index if not exists profiles_cohort_idx                 on public.profiles (cohort_id);
create index if not exists punishments_goal_idx                on public.punishments (goal_id);
create index if not exists punishments_reviewed_by_idx         on public.punishments (reviewed_by);
create index if not exists workouts_reviewed_by_idx            on public.workouts (reviewed_by);
create index if not exists weekly_scores_week_idx              on public.weekly_scores (week_start_date);
create index if not exists notifications_unread_idx            on public.notifications (user_id) where read_at is null;
