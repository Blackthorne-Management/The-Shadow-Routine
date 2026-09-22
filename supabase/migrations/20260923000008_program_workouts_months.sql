-- ============================================================================
-- The 12-week program: workouts with photo proof, monthly Gold / Ultra results,
-- personal consequences written at signup, and self-granted rewards.
-- (PENDING_UPDATES.md items 1–7)
--
--   Program:  2 prep weeks (outside the app, credited as green) + program weeks 1–10.
--             Month 1 = prep + weeks 1–2, Month 2 = weeks 3–6, Month 3 = weeks 7–10.
--             Months are decided when weeks 2, 6 and 10 close. After week 10: read-only.
--   Weekly:   Green ≥ 80%, Gray 60–79%, Red < 60%. A red week → that goal's own
--             punishment, proven to the mentor. Mid-week colors are never red.
--   Monthly:  Gold Month per goal (total ≥ gold target, ≥3 green, ≤1 gray, no red)
--             → the goal's reward; Gold in all 3 months → its big reward.
--             Ultra tier across all goals → "one wish" (gold) or Ultra Punishment (red).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Program dates: one row, set by the admin. start_date = Monday of program week 1
-- (the prep weeks are the two weeks before it).
-- ---------------------------------------------------------------------------
create table public.program_settings (
  id         int primary key default 1 check (id = 1),
  start_date date check (start_date is null or extract(isodow from start_date) = 1),
  updated_at timestamptz not null default now()
);
insert into public.program_settings (id) values (1) on conflict do nothing;
alter table public.program_settings enable row level security;
create policy program_read on public.program_settings for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Consequences, written with the coach at signup and approved by the mentor
-- ---------------------------------------------------------------------------
alter table public.goals
  add column red_week_punishment text check (char_length(red_week_punishment) <= 240),
  add column gold_reward         text check (char_length(gold_reward) <= 240),
  add column three_gold_reward   text check (char_length(three_gold_reward) <= 240),
  add column gold_month_target   numeric check (gold_month_target > 0);  -- null = 80% of 4 weeks

create table public.consequences (
  user_id          uuid primary key references public.profiles (id) on delete cascade,
  ultra_punishment text check (char_length(ultra_punishment) <= 240),
  ultra_wish       text check (char_length(ultra_wish) <= 240),
  updated_at       timestamptz not null default now()
);
alter table public.consequences enable row level security;
create policy consequences_read on public.consequences for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------------
-- Workouts: each 30+ minute session is its own row with a photo/clip, or an
-- exception request the mentor decides on. The gym goal's daily entry value is
-- the number of counted workouts that day (kept in sync by sync_gym_entry).
-- ---------------------------------------------------------------------------
create table public.workouts (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles (id) on delete cascade,
  entry_date     date not null,
  position       int  not null check (position between 1 and 6),
  workout_type   text not null check (char_length(workout_type) between 1 and 40),
  minutes        int  not null check (minutes between 30 and 600),
  media_path     text,             -- photo/clip in the private "proofs" bucket
  exception_note text,             -- "no photo" explanation for the mentor
  status         text not null check (status in ('approved', 'exception_pending', 'exception_accepted', 'rejected')),
  review_note    text,
  reviewed_by    uuid references public.profiles (id),
  reviewed_at    timestamptz,
  created_at     timestamptz not null default now(),
  unique (user_id, entry_date, position),
  check (media_path is not null or exception_note is not null)
);
create index workouts_date_idx on public.workouts (entry_date);
alter table public.workouts enable row level security;
create policy workouts_read on public.workouts for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
alter publication supabase_realtime add table public.workouts;

-- ---------------------------------------------------------------------------
-- Punishments now come in two kinds; Ultra Punishments aren't tied to a goal
-- ---------------------------------------------------------------------------
alter table public.punishments
  add column kind text not null default 'red_week' check (kind in ('red_week', 'ultra'));
alter table public.punishments alter column category drop not null;
create unique index punishments_ultra_once on public.punishments (user_id, week_start_date) where kind = 'ultra';

-- ---------------------------------------------------------------------------
-- Monthly results and rewards
-- ---------------------------------------------------------------------------
create table public.monthly_results (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  month_number int  not null check (month_number between 1 and 3),
  goals        jsonb not null,           -- {category: {label, pct, total, gold_target, greens, grays, reds, gold}}
  avg_pct      numeric not null,
  ultra_tier   text not null check (ultra_tier in ('gold', 'green', 'gray', 'red')),
  created_at   timestamptz not null default now(),
  unique (user_id, month_number)
);
alter table public.monthly_results enable row level security;
create policy monthly_read on public.monthly_results for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create table public.rewards (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  month_number int  not null check (month_number between 1 and 3),
  kind         text not null check (kind in ('gold_month', 'three_gold', 'ultra_wish')),
  category     public.goal_category,     -- null for the Ultra wish
  description  text not null,
  claimed_at   timestamptz,              -- optional: rewards are self-granted
  created_at   timestamptz not null default now(),
  unique (user_id, month_number, kind, category)
);
create unique index rewards_ultra_once on public.rewards (user_id, month_number) where kind = 'ultra_wish';
alter table public.rewards enable row level security;
create policy rewards_read on public.rewards for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------------
-- Existing gym goals become "workouts per week". Past gym check-ins carry over
-- as mentor-accepted workouts (they predate the photo rule) — except ones
-- reported under 30 minutes, which were never valid workouts.
-- ---------------------------------------------------------------------------
update public.goals
   set goal_type = 'percentage', unit = 'workouts',
       prompt = 'Did you work out for 30 minutes or more today?'
 where category = 'gym';

update public.daily_entries e set value_reported = 0
  from public.goals g
 where g.id = e.goal_id and g.category = 'gym' and e.value_reported > 0
   and (e.details ->> 'minutes') is not null and (e.details ->> 'minutes')::numeric < 30;

insert into public.workouts (user_id, entry_date, position, workout_type, minutes, exception_note, status)
select e.user_id, e.entry_date, 1,
       coalesce(nullif(e.details ->> 'workout_type', ''), 'Workout'),
       greatest(coalesce((e.details ->> 'minutes')::numeric, 30), 30)::int,
       'Logged before the photo rule', 'exception_accepted'
  from public.daily_entries e join public.goals g on g.id = e.goal_id
 where g.category = 'gym' and e.value_reported > 0
on conflict do nothing;

-- ============================================================================
-- Program helpers
-- ============================================================================
create or replace function public.program_start()
returns date language sql stable security definer set search_path = public as $$
  select start_date from public.program_settings where id = 1;
$$;

-- Where a given local date falls in the program
create or replace function public.program_state(p_today date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_start date := public.program_start();
  v_pw    int;
begin
  if v_start is null then return jsonb_build_object('status', 'unset'); end if;
  v_pw := floor((p_today - v_start) / 7.0)::int + 1;
  return jsonb_build_object(
    'status',        case when v_pw < 1 then 'prep' when v_pw > 10 then 'ended' else 'active' end,
    'start_date',    v_start,
    'end_date',      v_start + 69,
    'program_week',  v_pw,
    'month',         case when v_pw between 1 and 2 then 1 when v_pw between 3 and 6 then 2
                          when v_pw between 7 and 10 then 3 end,
    'week_of_month', case when v_pw between 1 and 2 then v_pw + 2 when v_pw between 3 and 6 then v_pw - 2
                          when v_pw between 7 and 10 then v_pw - 6 end
  );
end $$;

-- ============================================================================
-- Scoring: gym pace counts whole workouts owed; mid-week colors are never red
-- ============================================================================
create or replace function public.compute_week(p_week date)
returns void language plpgsql security definer set search_path = public as $$
begin
  p_week := public.week_start(p_week);

  with participants as (
    select p.id,
           t.today <= p_week + 6 as week_open,
           case when t.today > p_week + 6 then (p_week + 7) - t.pace_start
                when t.today < t.pace_start then 0
                else (t.today - t.pace_start)
                     + (exists (select 1 from public.daily_entries d
                                where d.user_id = p.id and d.entry_date = t.today))::int
           end as elapsed
      from public.profiles p
      cross join lateral (
        select public.local_today(p.id) as today,
               greatest(p_week, coalesce((p.activated_at at time zone p.timezone)::date, p_week)) as pace_start
      ) t
     where p.role = 'participant' and p.status = 'active'
  ),
  per_goal as (
    select g.user_id, g.category, g.goal_type, g.target_value, g.category_point_max, p.elapsed, p.week_open,
           coalesce(sum(case when g.goal_type = 'percentage' then e.value_reported
                             when e.value_reported > 0 then 1
                             else 0 end), 0) as actual
      from public.goals g
      join participants p on p.id = g.user_id
      left join public.daily_entries e
             on e.goal_id = g.id and e.entry_date between p_week and p_week + 6
     where g.status = 'approved'
     group by g.id, p.elapsed, p.week_open
  ),
  paced as (
    select *,
           -- workouts are whole sessions: owe floor(target × days / 7), like yes/no goals
           public.pace_band(actual, target_value,
                            case when category = 'gym' then 'binary'::public.goal_type else goal_type end,
                            elapsed) as raw_pace
      from per_goal
  ),
  banded as (
    select *,
           round(least(actual / target_value, 1.0) * category_point_max, 2) as points,
           least(actual / target_value, 1.0) as ratio,
           public.band_for(least(actual / target_value, 1.0)) as band,
           -- behind pace mid-week is "catch up" (gray); red only when the week closes
           case when week_open and raw_pace = 'red' then 'gray' else raw_pace end as pace
      from paced
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
  where (ws.category_scores, ws.bonus_points, ws.pace_band_per_category, ws.consistency_rank, ws.is_top_this_week)
        is distinct from
        (excluded.category_scores, excluded.bonus_points, excluded.pace_band_per_category, excluded.consistency_rank, excluded.is_top_this_week);

  delete from public.weekly_scores ws
   where ws.week_start_date = p_week and not ws.finalized
     and not exists (select 1 from public.profiles p
                     where p.id = ws.user_id and p.role = 'participant' and p.status = 'active');
end $$;

-- ============================================================================
-- Monthly stats for one participant: per goal, month-to-date, week by week.
-- Month 1 includes the two prep weeks, credited green at 100% of target.
-- ============================================================================
create or replace function public.month_goal_stats(p_user uuid, p_month int)
returns table (
  category public.goal_category, label text, target numeric, gold_target numeric,
  month_total numeric, month_max numeric, pct numeric,
  greens int, grays int, reds int, closed_weeks int, weeks jsonb,
  gold_reward text, three_gold_reward text
) language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_start  date := public.program_start();
  v_today  date := public.local_today(p_user);
  v_first  int  := case p_month when 1 then 1 when 2 then 3 else 7 end;
  v_last   int  := case p_month when 1 then 2 when 2 then 6 else 10 end;
  g        record;
  w        int;
  v_ws     date;
  v_cs     jsonb;
  v_band   text;
  v_state  text;
  v_actual numeric;
begin
  if v_start is null or p_month not between 1 and 3 then return; end if;

  for g in
    select gl.* from public.goals gl
     where gl.user_id = p_user and gl.status = 'approved'
     order by array_position(array['gym', 'refraining', 'custom_1', 'custom_2', 'custom_3']::public.goal_category[], gl.category)
  loop
    category := g.category; label := g.label; target := g.target_value;
    gold_target := coalesce(g.gold_month_target, ceil(0.8 * 4 * g.target_value));
    month_max := 4 * g.target_value;
    gold_reward := g.gold_reward; three_gold_reward := g.three_gold_reward;
    month_total := 0; greens := 0; grays := 0; reds := 0; closed_weeks := 0; weeks := '[]'::jsonb;

    if p_month = 1 then
      month_total := 2 * g.target_value; greens := 2; closed_weeks := 2;
      weeks := jsonb_build_array(
        jsonb_build_object('label', 'Prep 1', 'band', 'green', 'state', 'prep', 'actual', g.target_value),
        jsonb_build_object('label', 'Prep 2', 'band', 'green', 'state', 'prep', 'actual', g.target_value));
    end if;

    for w in v_first..v_last loop
      v_ws := v_start + 7 * (w - 1);
      v_cs := null;
      if v_today < v_ws then
        v_state := 'future'; v_band := null; v_actual := 0;
      else
        select ws.category_scores -> g.category::text into v_cs
          from public.weekly_scores ws
         where ws.user_id = p_user and ws.week_start_date = v_ws;
        v_actual := coalesce((v_cs ->> 'actual')::numeric, 0);
        if v_today > v_ws + 6 then
          v_state := 'closed';
          v_band := coalesce(v_cs ->> 'band', 'red');
          closed_weeks := closed_weeks + 1;
          if v_band = 'green' then greens := greens + 1;
          elsif v_band = 'gray' then grays := grays + 1;
          else reds := reds + 1; end if;
        else
          v_state := 'current';
          v_band := v_cs ->> 'pace_band';
        end if;
      end if;
      month_total := month_total + v_actual;
      weeks := weeks || jsonb_build_object('label', 'Week ' || w, 'band', v_band, 'state', v_state, 'actual', v_actual);
    end loop;

    pct := least(month_total / nullif(month_max, 0), 1.0);
    return next;
  end loop;
end $$;

-- The participant's (or, for the admin, anyone's) current month at a glance
create or replace function public.month_status(p_user uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_uid   uuid := coalesce(p_user, auth.uid());
  v_prog  jsonb;
  v_month int;
begin
  if v_uid is distinct from auth.uid() and not public.is_admin() then raise exception 'NOT_ALLOWED'; end if;
  v_prog  := public.program_state(public.local_today(v_uid));
  v_month := (v_prog ->> 'month')::int;
  return v_prog || jsonb_build_object('goals',
    case when v_month is null then '[]'::jsonb else coalesce((
      select jsonb_agg(to_jsonb(s) - 'gold_reward' - 'three_gold_reward' || jsonb_build_object(
               'gold_status', case when s.reds > 0 or s.grays > 1 then 'lost' else 'on_track' end,
               'gold_reward', s.gold_reward))
        from public.month_goal_stats(v_uid, v_month) s), '[]'::jsonb) end);
end $$;

-- Close a month: Gold Months + rewards, the Ultra tier, and the Ultra Punishment
create or replace function public.finalize_month(p_month int)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_start date := public.program_start();
  v_last  int  := case p_month when 1 then 2 when 2 then 6 else 10 end;
  p       record;
  s       record;
  v_goals jsonb;
  v_gold  boolean;
  v_all80 boolean;
  v_all75 boolean;
  v_clean boolean;
  v_ok    boolean;
  v_sum   numeric;
  v_n     int;
  v_avg   numeric;
  v_tier  text;
  v_done  int := 0;
begin
  if v_start is null or p_month not between 1 and 3 then return 0; end if;

  for p in select id from public.profiles where role = 'participant' and status = 'active' loop
    continue when exists (select 1 from public.monthly_results where user_id = p.id and month_number = p_month);

    v_goals := '{}'::jsonb; v_all80 := true; v_all75 := true; v_clean := true; v_ok := true; v_sum := 0; v_n := 0;

    for s in select * from public.month_goal_stats(p.id, p_month) loop
      v_gold := s.month_total >= s.gold_target and s.greens >= 3 and s.grays <= 1 and s.reds = 0;
      v_goals := v_goals || jsonb_build_object(s.category::text, jsonb_build_object(
        'label', s.label, 'pct', round(s.pct * 100), 'total', s.month_total, 'gold_target', s.gold_target,
        'greens', s.greens, 'grays', s.grays, 'reds', s.reds, 'gold', v_gold));

      v_all80 := v_all80 and s.pct >= 0.8;
      v_all75 := v_all75 and s.pct >= 0.75;
      v_clean := v_clean and s.grays = 0 and s.reds = 0;
      v_ok    := v_ok and s.grays <= 1 and s.reds = 0;
      v_sum   := v_sum + s.pct; v_n := v_n + 1;

      if v_gold then
        insert into public.rewards (user_id, month_number, kind, category, description)
        values (p.id, p_month, 'gold_month', s.category,
                coalesce(nullif(trim(s.gold_reward), ''), 'Gold Month reward (set it with your coach)'))
        on conflict do nothing;

        -- Gold in all three months for this goal → the big reward
        if p_month = 3 and (select count(*) = 2 and bool_and(coalesce((mr.goals -> s.category::text ->> 'gold')::boolean, false))
                              from public.monthly_results mr
                             where mr.user_id = p.id and mr.month_number in (1, 2)) then
          insert into public.rewards (user_id, month_number, kind, category, description)
          values (p.id, 3, 'three_gold', s.category,
                  coalesce(nullif(trim(s.three_gold_reward), ''), '3 Gold Months reward (set it with your coach)'))
          on conflict do nothing;
        end if;
      end if;
    end loop;

    continue when v_n = 0;
    v_avg := v_sum / v_n;
    v_tier := case when v_all80 and v_clean then 'gold'
                   when v_all75 and v_ok    then 'green'
                   when v_avg >= 0.6        then 'gray'
                   else 'red' end;

    insert into public.monthly_results (user_id, month_number, goals, avg_pct, ultra_tier)
    values (p.id, p_month, v_goals, round(v_avg * 100, 1), v_tier);

    if v_tier = 'gold' then
      insert into public.rewards (user_id, month_number, kind, category, description)
      values (p.id, p_month, 'ultra_wish', null,
              coalesce(nullif(trim((select ultra_wish from public.consequences where user_id = p.id)), ''), 'One wish of your choice'))
      on conflict do nothing;
    elsif v_tier = 'red' then
      insert into public.punishments (user_id, kind, category, week_start_date, punishment_description, proof_type)
      values (p.id, 'ultra', null, v_start + 7 * (v_last - 1),
              coalesce(nullif(trim((select ultra_punishment from public.consequences where user_id = p.id)), ''),
                       'Ultra Punishment: to be set with your mentor'),
              'photo')
      on conflict do nothing;
    end if;
    v_done := v_done + 1;
  end loop;
  return v_done;
end $$;

-- ============================================================================
-- Week close-out: the goal's own red-week punishment (library as fallback),
-- nothing for prep / post-program weeks, and months close at weeks 2, 6, 10.
-- ============================================================================
create or replace function public.finalize_week(p_week date)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_created int := 0;
  v_start   date := public.program_start();
  v_pw      int;
begin
  p_week := public.week_start(p_week);
  perform public.compute_week(p_week);

  update public.weekly_scores set finalized = true where week_start_date = p_week;

  if v_start is null or p_week between v_start and v_start + 63 then
    insert into public.punishments
      (user_id, category, goal_id, week_start_date, punishment_description, proof_required, proof_type)
    select ws.user_id, b.key::public.goal_category, g.id, p_week,
           coalesce(nullif(trim(g.red_week_punishment), ''), lib.description,
                    'Punishment to be assigned — talk to your mentor.'),
           true,
           case when nullif(trim(g.red_week_punishment), '') is not null then 'photo'::public.proof_type
                else coalesce(lib.proof_type, 'mentor_conversation') end
      from public.weekly_scores ws
      join public.profiles p on p.id = ws.user_id
      cross join lateral jsonb_each_text(ws.band_per_category) b
      join public.goals g on g.user_id = ws.user_id and g.category = b.key::public.goal_category
      left join lateral (
        select pl.description, pl.proof_type
          from public.punishment_library pl
         where pl.active and pl.theme in (g.theme, 'other')
         order by (pl.theme = g.theme) desc, random()
         limit 1
      ) lib on true
     where ws.week_start_date = p_week
       and b.value = 'red'
       and p.status = 'active'
       and p.activated_at < p_week::timestamp at time zone p.timezone
    on conflict (user_id, category, week_start_date) do nothing;
    get diagnostics v_created = row_count;
  end if;

  if v_start is not null then
    v_pw := (p_week - v_start) / 7 + 1;
    if v_pw in (2, 6, 10) then
      perform public.finalize_month(case v_pw when 2 then 1 when 6 then 2 else 3 end);
    end if;
  end if;
  return v_created;
end $$;

-- ============================================================================
-- Goals + consequences at signup; the mentor approves/edits both
-- ============================================================================
drop function if exists public.submit_goals(jsonb);
create or replace function public.submit_goals(p_goals jsonb, p_consequences jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid    uuid := auth.uid();
  g        jsonb;
  v_cat    public.goal_category;
  v_theme  public.goal_theme;
  v_type   public.goal_type;
  v_unit   text;
  v_target numeric;
begin
  if not exists (select 1 from public.profiles
                 where id = v_uid and status = 'pending_approval' and role = 'participant') then
    raise exception 'GOALS_LOCKED';
  end if;
  if jsonb_array_length(p_goals) <> 5
     or (select count(distinct x ->> 'category') from jsonb_array_elements(p_goals) x) <> 5 then
    raise exception 'NEED_FIVE_GOALS';
  end if;
  if coalesce(trim(p_consequences ->> 'ultra_punishment'), '') = ''
     or coalesce(trim(p_consequences ->> 'ultra_wish'), '') = '' then
    raise exception 'NEED_CONSEQUENCES';
  end if;

  delete from public.goals where user_id = v_uid;

  for g in select * from jsonb_array_elements(p_goals) loop
    v_cat    := (g ->> 'category')::public.goal_category;
    v_theme  := (g ->> 'theme')::public.goal_theme;
    v_type   := (g ->> 'goal_type')::public.goal_type;
    v_unit   := trim(g ->> 'unit');
    v_target := (g ->> 'target_value')::numeric;

    if v_cat = 'gym' then
      v_theme := 'gym'; v_type := 'percentage'; v_unit := 'workouts';
      if v_target not between 1 and 21 then raise exception 'BAD_WORKOUT_TARGET'; end if;
    elsif v_cat = 'refraining' then
      v_theme := 'refraining'; v_type := 'inverse';
    elsif v_theme in ('gym', 'refraining') or v_type = 'inverse' then
      raise exception 'BAD_CUSTOM_GOAL';
    end if;
    if v_cat <> 'gym' and v_type <> 'percentage' and v_target > 7 then
      raise exception 'TARGET_OVER_7_DAYS';
    end if;
    if coalesce(trim(g ->> 'red_week_punishment'), '') = ''
       or coalesce(trim(g ->> 'gold_reward'), '') = ''
       or coalesce(trim(g ->> 'three_gold_reward'), '') = '' then
      raise exception 'NEED_CONSEQUENCES';
    end if;

    insert into public.goals (user_id, category, theme, goal_type, label, prompt, target_value, unit,
                              category_point_max, red_week_punishment, gold_reward, three_gold_reward)
    values (v_uid, v_cat, v_theme, v_type,
            trim(g ->> 'label'),
            case when v_cat = 'gym' then 'Did you work out for 30 minutes or more today?' else trim(g ->> 'prompt') end,
            v_target, v_unit, public.category_point_max(v_cat),
            trim(g ->> 'red_week_punishment'), trim(g ->> 'gold_reward'), trim(g ->> 'three_gold_reward'));
  end loop;

  insert into public.consequences (user_id, ultra_punishment, ultra_wish)
  values (v_uid, trim(p_consequences ->> 'ultra_punishment'), trim(p_consequences ->> 'ultra_wish'))
  on conflict (user_id) do update set
    ultra_punishment = excluded.ultra_punishment, ultra_wish = excluded.ultra_wish, updated_at = now();
end $$;

drop function if exists public.approve_goals(uuid, jsonb);
create or replace function public.approve_goals(p_user uuid, p_goals jsonb, p_consequences jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  g jsonb;
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;

  for g in select * from jsonb_array_elements(coalesce(p_goals, '[]')) loop
    update public.goals set
      label               = coalesce(nullif(trim(g ->> 'label'), ''), label),
      prompt              = coalesce(nullif(trim(g ->> 'prompt'), ''), prompt),
      target_value        = coalesce((g ->> 'target_value')::numeric, target_value),
      unit                = case when category = 'gym' then 'workouts' else coalesce(nullif(trim(g ->> 'unit'), ''), unit) end,
      goal_type           = case when category in ('gym', 'refraining') then goal_type
                                 else coalesce((g ->> 'goal_type')::public.goal_type, goal_type) end,
      theme               = case when category in ('gym', 'refraining') then theme
                                 else coalesce((g ->> 'theme')::public.goal_theme, theme) end,
      red_week_punishment = case when g ? 'red_week_punishment' then nullif(trim(g ->> 'red_week_punishment'), '') else red_week_punishment end,
      gold_reward         = case when g ? 'gold_reward' then nullif(trim(g ->> 'gold_reward'), '') else gold_reward end,
      three_gold_reward   = case when g ? 'three_gold_reward' then nullif(trim(g ->> 'three_gold_reward'), '') else three_gold_reward end,
      gold_month_target   = case when g ? 'gold_month_target' then nullif(g ->> 'gold_month_target', '')::numeric else gold_month_target end
    where id = (g ->> 'id')::uuid and user_id = p_user;
  end loop;

  if p_consequences is not null then
    insert into public.consequences (user_id, ultra_punishment, ultra_wish)
    values (p_user, nullif(trim(p_consequences ->> 'ultra_punishment'), ''), nullif(trim(p_consequences ->> 'ultra_wish'), ''))
    on conflict (user_id) do update set
      ultra_punishment = excluded.ultra_punishment, ultra_wish = excluded.ultra_wish, updated_at = now();
  end if;

  update public.goals
     set status = 'approved', approved_by = auth.uid(), approved_at = coalesce(approved_at, now())
   where user_id = p_user;

  if (select count(*) from public.goals where user_id = p_user and status = 'approved') <> 5 then
    raise exception 'NEED_FIVE_GOALS';
  end if;

  update public.profiles
     set status = 'active', activated_at = coalesce(activated_at, now())
   where id = p_user and status = 'pending_approval';
end $$;

-- ============================================================================
-- Check-in with workouts
-- p_workouts: [{workout_type, minutes, media_path?, exception_note?}] for today,
-- or null to leave today's workouts untouched. An empty array = "no workout".
-- ============================================================================
create or replace function public.sync_gym_entry(p_user uuid, p_date date)
returns void language sql security definer set search_path = public as $$
  insert into public.daily_entries (user_id, goal_id, entry_date, value_reported, details)
  select p_user, g.id, p_date,
         (select count(*) from public.workouts w
           where w.user_id = p_user and w.entry_date = p_date and w.status in ('approved', 'exception_accepted')),
         jsonb_build_object('logged', (select count(*) from public.workouts w
                                        where w.user_id = p_user and w.entry_date = p_date))
    from public.goals g
   where g.user_id = p_user and g.category = 'gym'
  on conflict (user_id, goal_id, entry_date) do update set
    value_reported = excluded.value_reported, details = excluded.details, updated_at = now();
$$;

drop function if exists public.submit_checkin(jsonb, boolean);
create or replace function public.submit_checkin(p_entries jsonb, p_bonus boolean, p_workouts jsonb default null)
returns date language plpgsql security definer set search_path = public as $$
declare
  v_uid    uuid := auth.uid();
  v_date   date;
  v_status text;
  e        jsonb;
  w        jsonb;
  v_goal   public.goals;
  v_val    numeric;
  v_ch     public.bonus_challenges;
  v_pos    int := 0;
  v_min    numeric;
  v_path   text;
  v_note   text;
  v_prev   jsonb;
begin
  if not exists (select 1 from public.profiles
                 where id = v_uid and status = 'active' and role = 'participant') then
    raise exception 'NOT_ACTIVE';
  end if;
  v_date := public.local_today(v_uid);
  v_status := public.program_state(v_date) ->> 'status';
  if v_status = 'prep' then raise exception 'PROGRAM_NOT_STARTED'; end if;
  if v_status = 'ended' then raise exception 'PROGRAM_ENDED'; end if;

  for e in select * from jsonb_array_elements(p_entries) loop
    select * into v_goal from public.goals
     where id = (e ->> 'goal_id')::uuid and user_id = v_uid and status = 'approved';
    if not found then raise exception 'BAD_GOAL'; end if;
    continue when v_goal.category = 'gym';  -- workouts come through p_workouts

    v_val := greatest(coalesce((e ->> 'value')::numeric, 0), 0);
    if v_goal.goal_type <> 'percentage' then
      v_val := case when v_val > 0 then 1 else 0 end;
    end if;

    insert into public.daily_entries (user_id, goal_id, entry_date, value_reported, notes, details)
    values (v_uid, v_goal.id, v_date, v_val, nullif(trim(e ->> 'notes'), ''), e -> 'details')
    on conflict (user_id, goal_id, entry_date) do update set
      value_reported = excluded.value_reported,
      notes          = excluded.notes,
      details        = excluded.details,
      updated_at     = now();
  end loop;

  if p_workouts is not null then
    if jsonb_array_length(p_workouts) > 6 then raise exception 'TOO_MANY_WORKOUTS'; end if;
    -- Re-saving today must not undo the mentor: an unchanged photo/note keeps its review status
    select coalesce(jsonb_object_agg(coalesce(media_path, '') || '|' || coalesce(exception_note, ''), status), '{}'::jsonb)
      into v_prev
      from public.workouts
     where user_id = v_uid and entry_date = v_date and reviewed_at is not null;
    delete from public.workouts where user_id = v_uid and entry_date = v_date;
    for w in select * from jsonb_array_elements(p_workouts) loop
      v_pos  := v_pos + 1;
      v_min  := (w ->> 'minutes')::numeric;
      v_path := nullif(trim(w ->> 'media_path'), '');
      v_note := nullif(trim(w ->> 'exception_note'), '');
      if v_min is null or v_min < 30 then raise exception 'WORKOUT_TOO_SHORT'; end if;
      if v_path is null and v_note is null then raise exception 'WORKOUT_NEEDS_PHOTO'; end if;
      if v_path is not null and v_path not like v_uid::text || '/workouts/%' then raise exception 'BAD_PATH'; end if;
      if v_path is not null then v_note := null; end if;
      insert into public.workouts (user_id, entry_date, position, workout_type, minutes, media_path, exception_note, status)
      values (v_uid, v_date, v_pos,
              coalesce(nullif(trim(w ->> 'workout_type'), ''), 'Workout'), round(v_min)::int,
              v_path, v_note,
              coalesce(v_prev ->> (coalesce(v_path, '') || '|' || coalesce(v_note, '')),
                       case when v_path is not null then 'approved' else 'exception_pending' end));
    end loop;
    perform public.sync_gym_entry(v_uid, v_date);
  end if;

  if p_bonus is not null then
    v_ch := public.ensure_bonus_challenge(v_date);
    if v_ch.id is not null then
      insert into public.bonus_completions (user_id, bonus_challenge_id, completed)
      values (v_uid, v_ch.id, p_bonus)
      on conflict (user_id, bonus_challenge_id) do update set
        completed = excluded.completed, completed_at = now();
    end if;
  end if;

  perform public.compute_week(public.week_start(v_date));
  return v_date;
end $$;

create or replace function public.today_context()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid  uuid := auth.uid();
  v_date date := public.local_today(v_uid);
  v_ch   public.bonus_challenges;
begin
  v_ch := public.ensure_bonus_challenge(v_date);
  return jsonb_build_object(
    'date', v_date,
    'week_start', public.week_start(v_date),
    'program', public.program_state(v_date),
    'challenge', case when v_ch.id is null then null
                      else jsonb_build_object('id', v_ch.id, 'description', v_ch.description,
                                              'point_value', v_ch.point_value) end,
    'bonus_completed', (select completed from public.bonus_completions
                         where user_id = v_uid and bonus_challenge_id = v_ch.id),
    'entries', coalesce((select jsonb_agg(jsonb_build_object(
                           'goal_id', goal_id, 'value', value_reported,
                           'notes', notes, 'details', details, 'submitted_at', submitted_at))
                         from public.daily_entries
                         where user_id = v_uid and entry_date = v_date), '[]'::jsonb),
    'workouts', coalesce((select jsonb_agg(jsonb_build_object(
                            'id', id, 'position', position, 'workout_type', workout_type, 'minutes', minutes,
                            'media_path', media_path, 'exception_note', exception_note, 'status', status)
                            order by position)
                          from public.workouts
                          where user_id = v_uid and entry_date = v_date), '[]'::jsonb)
  );
end $$;

-- ============================================================================
-- Mentor review of workout photos / exception requests
-- ============================================================================
create or replace function public.review_workout(p_id uuid, p_accept boolean, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_w    public.workouts;
  v_week date;
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  select * into v_w from public.workouts where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;

  update public.workouts set
    status      = case when not p_accept then 'rejected'
                       when media_path is not null then 'approved'
                       else 'exception_accepted' end,
    review_note = nullif(trim(p_note), ''),
    reviewed_by = auth.uid(),
    reviewed_at = now()
  where id = p_id;

  perform public.sync_gym_entry(v_w.user_id, v_w.entry_date);
  v_week := public.week_start(v_w.entry_date);
  -- A closed week is re-finalized so a now-red week still gets its punishment
  if exists (select 1 from public.weekly_scores where week_start_date = v_week and finalized) then
    perform public.finalize_week(v_week);
  else
    perform public.compute_week(v_week);
  end if;
end $$;

-- ============================================================================
-- Rewards, program admin
-- ============================================================================
create or replace function public.claim_reward(p_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.rewards set claimed_at = coalesce(claimed_at, now())
   where id = p_id and user_id = auth.uid();
$$;

create or replace function public.admin_set_program_start(p_date date)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  if p_date is not null and extract(isodow from p_date) <> 1 then raise exception 'MUST_BE_MONDAY'; end if;
  update public.program_settings set start_date = p_date, updated_at = now() where id = 1;
end $$;

create or replace function public.admin_finalize_month(p_month int)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_start date := public.program_start();
  v_last  int  := case p_month when 1 then 2 when 2 then 6 else 10 end;
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  if v_start is null then raise exception 'PROGRAM_NOT_SET'; end if;
  if (now() at time zone 'UTC')::date <= v_start + 7 * v_last - 1 then raise exception 'MONTH_NOT_OVER'; end if;
  return public.finalize_month(p_month);
end $$;

-- ============================================================================
-- Privileges: internal helpers stay server-side
-- ============================================================================
revoke execute on function public.compute_week(date)            from public, anon, authenticated;
revoke execute on function public.finalize_week(date)           from public, anon, authenticated;
revoke execute on function public.finalize_month(int)           from public, anon, authenticated;
revoke execute on function public.month_goal_stats(uuid, int)   from public, anon, authenticated;
revoke execute on function public.sync_gym_entry(uuid, date)    from public, anon, authenticated;
revoke execute on function public.program_start()               from public, anon;
revoke execute on function public.program_state(date)           from public, anon;
revoke execute on function public.submit_goals(jsonb, jsonb)    from public, anon;
revoke execute on function public.approve_goals(uuid, jsonb, jsonb) from public, anon;
revoke execute on function public.submit_checkin(jsonb, boolean, jsonb) from public, anon;
revoke execute on function public.today_context()               from public, anon;
revoke execute on function public.month_status(uuid)            from public, anon;
revoke execute on function public.review_workout(uuid, boolean, text) from public, anon;
revoke execute on function public.claim_reward(uuid)            from public, anon;
revoke execute on function public.admin_set_program_start(date) from public, anon;
revoke execute on function public.admin_finalize_month(int)     from public, anon;
