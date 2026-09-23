-- ============================================================================
-- Mentors in the cohort + mentor invite links
--
--   profiles.mentor_participates: a mentor (admin) can opt in to set goals and
--   check in. They're scored every week and shown on the leaderboard, but are
--   unranked: no place, never "most consistent", and they don't change anyone
--   else's rank. No punishments, rewards, month results or rank levels.
--
--   invite_codes.role: 'mentor' codes sign someone up as a mentor (admin),
--   active immediately with no goal approval.
-- ============================================================================

alter table public.profiles add column mentor_participates boolean not null default false;
grant select (mentor_participates) on public.profiles to authenticated;

alter table public.invite_codes add column role text not null default 'participant'
  check (role in ('participant', 'mentor'));

-- ---------------------------------------------------------------------------
-- Signup: a mentor code creates an active mentor
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_code     text := upper(trim(coalesce(new.raw_user_meta_data ->> 'invite_code', '')));
  v_username text := lower(trim(coalesce(new.raw_user_meta_data ->> 'username', '')));
  v_display  text := coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), v_username);
  v_tz       text := coalesce(nullif(new.raw_user_meta_data ->> 'timezone', ''), 'UTC');
  v_sex      text := nullif(new.raw_user_meta_data ->> 'sex', '');
  v_invite   public.invite_codes;
begin
  select * into v_invite from public.invite_codes
   where code = v_code and status = 'unused'
   for update;
  if v_invite.id is null then
    raise exception 'INVALID_INVITE_CODE';
  end if;
  if not public.valid_timezone(v_tz) then v_tz := 'UTC'; end if;
  if v_sex not in ('male', 'female') then v_sex := null; end if;

  if v_invite.role = 'mentor' then
    insert into public.profiles (id, email, username, display_name, invite_code_used, timezone, sex,
                                 role, status, activated_at)
    values (new.id, new.email, v_username, v_display, v_code, v_tz, v_sex, 'admin', 'active', now());
  else
    insert into public.profiles (id, email, username, display_name, invite_code_used, timezone, sex)
    values (new.id, new.email, v_username, v_display, v_code, v_tz, v_sex);
  end if;

  update public.invite_codes
     set status = 'used', used_by = new.id, used_at = now()
   where id = v_invite.id;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- The switch, and a mentor's own goals (saved in place so history is kept)
-- ---------------------------------------------------------------------------
create or replace function public.set_mentor_participation(p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  update public.profiles set mentor_participates = p_on where id = auth.uid();
  perform public.compute_week(public.week_start(public.local_today(auth.uid())));
end $$;

-- p_goals: [{category, theme, goal_type, label, prompt, target_value, unit}] × 5
create or replace function public.mentor_save_goals(p_goals jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid    uuid := auth.uid();
  g        jsonb;
  v_cat    public.goal_category;
  v_theme  public.goal_theme;
  v_type   public.goal_type;
  v_target numeric;
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  if jsonb_array_length(p_goals) <> 5
     or (select count(distinct x ->> 'category') from jsonb_array_elements(p_goals) x) <> 5 then
    raise exception 'NEED_FIVE_GOALS';
  end if;
  for g in select * from jsonb_array_elements(p_goals) loop
    v_cat    := (g ->> 'category')::public.goal_category;
    v_theme  := (g ->> 'theme')::public.goal_theme;
    v_type   := (g ->> 'goal_type')::public.goal_type;
    v_target := (g ->> 'target_value')::numeric;
    if v_cat = 'gym' then
      v_theme := 'gym'; v_type := 'percentage';
      if v_target not between 1 and 21 then raise exception 'BAD_WORKOUT_TARGET'; end if;
    elsif v_cat = 'refraining' then
      v_theme := 'refraining'; v_type := 'inverse';
    elsif v_theme in ('gym', 'refraining') or v_type = 'inverse' then
      raise exception 'BAD_CUSTOM_GOAL';
    end if;
    if v_cat <> 'gym' and v_type <> 'percentage' and v_target > 7 then raise exception 'TARGET_OVER_7_DAYS'; end if;

    insert into public.goals (user_id, category, theme, goal_type, label, prompt, target_value, unit,
                              category_point_max, status, approved_by, approved_at)
    values (v_uid, v_cat, v_theme, v_type, trim(g ->> 'label'),
            case when v_cat = 'gym' then 'Did you work out for 30 minutes or more today?' else trim(g ->> 'prompt') end,
            v_target, case when v_cat = 'gym' then 'workouts' else trim(g ->> 'unit') end,
            public.category_point_max(v_cat), 'approved', v_uid, now())
    on conflict (user_id, category) do update set
      theme = excluded.theme, goal_type = excluded.goal_type, label = excluded.label, prompt = excluded.prompt,
      target_value = excluded.target_value, unit = excluded.unit, status = 'approved';
  end loop;
  perform public.compute_week(public.week_start(public.local_today(v_uid)));
end $$;

-- ---------------------------------------------------------------------------
-- Scoring, close-out and check-in: participating mentors in, but unranked
-- and never punished
-- ---------------------------------------------------------------------------
create or replace function public.compute_week(p_week date)
returns void language plpgsql security definer set search_path = public as $$
begin
  p_week := public.week_start(p_week);

  with participants as (
    select p.id,
           p.role = 'admin' as is_mentor,
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
     where p.status = 'active' and (p.role = 'participant' or (p.role = 'admin' and p.mentor_participates))
  ),
  per_goal as (
    select g.user_id, g.category, g.goal_type, g.target_value, g.category_point_max, p.elapsed, p.week_open, p.is_mentor,
           coalesce(sum(case when g.goal_type = 'percentage' then e.value_reported
                             when e.value_reported > 0 then 1
                             else 0 end), 0) as actual
      from public.goals g
      join participants p on p.id = g.user_id
      left join public.daily_entries e
             on e.goal_id = g.id and e.entry_date between p_week and p_week + 6
     where g.status = 'approved'
     group by g.id, p.elapsed, p.week_open, p.is_mentor
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
           count(*) filter (where band = 'green') as greens,
           bool_or(is_mentor) as is_mentor
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
           -- Mentors are scored but unranked: they can't take a place or "most consistent"
           case when not cat.is_mentor then
             rank() over (partition by cat.is_mentor order by cat.total_cat + coalesce(b.pts, 0) desc, cat.greens desc)
           end as rnk
      from cat left join bonus b on b.user_id = cat.user_id
  )
  insert into public.weekly_scores as ws
    (user_id, week_start_date, category_scores, total_category_points, bonus_points,
     total_points, band_per_category, pace_band_per_category, consistency_rank, is_top_this_week, updated_at)
  select user_id, p_week, category_scores, total_cat, bonus_pts,
         total, bands, pace_bands, rnk, coalesce(rnk = 1 and total > 0, false), now()
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
                     where p.id = ws.user_id and p.status = 'active'
                       and (p.role = 'participant' or (p.role = 'admin' and p.mentor_participates)));
end $$;

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
       and p.role = 'participant'  -- participating mentors are never punished
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
  v_rev    jsonb;
begin
  if not exists (select 1 from public.profiles
                 where id = v_uid and status = 'active'
                   and (role = 'participant' or (role = 'admin' and mentor_participates))) then
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
    -- Re-saving today must not undo the mentor: an unchanged photo/note keeps its
    -- whole review (status, note, reviewer, time), however many times it's re-saved
    select coalesce(jsonb_object_agg(coalesce(media_path, '') || '|' || coalesce(exception_note, ''),
             jsonb_build_object('status', status, 'review_note', review_note,
                                'reviewed_by', reviewed_by, 'reviewed_at', reviewed_at)), '{}'::jsonb)
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
      v_rev := v_prev -> (coalesce(v_path, '') || '|' || coalesce(v_note, ''));
      insert into public.workouts (user_id, entry_date, position, workout_type, minutes, media_path, exception_note,
                                   status, review_note, reviewed_by, reviewed_at)
      values (v_uid, v_date, v_pos,
              coalesce(nullif(trim(w ->> 'workout_type'), ''), 'Workout'), round(v_min)::int,
              v_path, v_note,
              coalesce(v_rev ->> 'status', case when v_path is not null then 'approved' else 'exception_pending' end),
              v_rev ->> 'review_note', (v_rev ->> 'reviewed_by')::uuid, (v_rev ->> 'reviewed_at')::timestamptz);
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

revoke execute on function public.compute_week(date)                         from public, anon, authenticated;
revoke execute on function public.finalize_week(date)                        from public, anon, authenticated;
revoke execute on function public.set_mentor_participation(boolean)          from public, anon;
revoke execute on function public.mentor_save_goals(jsonb)                   from public, anon;
revoke execute on function public.submit_checkin(jsonb, boolean, jsonb)      from public, anon;
