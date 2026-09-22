-- ============================================================================
-- The Shadow Routine — business logic
-- All state changes that matter for fairness run here, server-side.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Date helpers. Weeks run Monday–Sunday in each participant's local time.
-- ---------------------------------------------------------------------------
create or replace function public.week_start(d date)
returns date language sql immutable as $$
  select d - (extract(isodow from d)::int - 1);
$$;

create or replace function public.local_today(p_user uuid)
returns date language sql stable security definer set search_path = public as $$
  select (now() at time zone coalesce((select timezone from public.profiles where id = p_user), 'UTC'))::date;
$$;

create or replace function public.category_point_max(c public.goal_category)
returns int language sql immutable as $$
  select case c
    when 'gym'        then 300
    when 'refraining' then 200
    when 'custom_1'   then 200
    when 'custom_2'   then 150
    when 'custom_3'   then 150
  end;
$$;

create or replace function public.valid_timezone(tz text)
returns boolean language plpgsql stable as $$
begin
  perform now() at time zone tz;
  return true;
exception when others then
  return false;
end $$;

-- ---------------------------------------------------------------------------
-- Profile guard: only admins (or the backend) can change role/status/etc.
-- ---------------------------------------------------------------------------
create or replace function public.guard_profile_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.role is distinct from old.role
       or new.status is distinct from old.status
       or new.username is distinct from old.username
       or new.activated_at is distinct from old.activated_at
       or new.invite_code_used is distinct from old.invite_code_used then
      raise exception 'NOT_ALLOWED';
    end if;
  end if;
  if not public.valid_timezone(new.timezone) then
    raise exception 'INVALID_TIMEZONE';
  end if;
  return new;
end $$;

create trigger profiles_guard before update on public.profiles
  for each row execute function public.guard_profile_update();

-- ---------------------------------------------------------------------------
-- Signup. The client calls supabase.auth.signUp() with metadata
-- {invite_code, username, display_name, timezone}. This trigger redeems the
-- code atomically; an invalid code aborts account creation entirely.
-- ---------------------------------------------------------------------------
create or replace function public.check_signup(p_code text, p_username text)
returns text language plpgsql stable security definer set search_path = public as $$
begin
  if lower(coalesce(p_username, '')) !~ '^[a-z0-9_]{3,24}$' then return 'bad_username'; end if;
  if not exists (select 1 from public.invite_codes
                 where code = upper(trim(p_code)) and status = 'unused') then
    return 'invalid_code';
  end if;
  if exists (select 1 from public.profiles where username = lower(p_username)) then
    return 'username_taken';
  end if;
  return 'ok';
end $$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_code     text := upper(trim(coalesce(new.raw_user_meta_data ->> 'invite_code', '')));
  v_username text := lower(trim(coalesce(new.raw_user_meta_data ->> 'username', '')));
  v_display  text := coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), v_username);
  v_tz       text := coalesce(nullif(new.raw_user_meta_data ->> 'timezone', ''), 'UTC');
  v_invite   uuid;
begin
  select id into v_invite from public.invite_codes
   where code = v_code and status = 'unused'
   for update;
  if v_invite is null then
    raise exception 'INVALID_INVITE_CODE';
  end if;
  if not public.valid_timezone(v_tz) then v_tz := 'UTC'; end if;

  insert into public.profiles (id, email, username, display_name, invite_code_used, timezone)
  values (new.id, new.email, v_username, v_display, v_code, v_tz);

  update public.invite_codes
     set status = 'used', used_by = new.id, used_at = now()
   where id = v_invite;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Goal proposal (participant) and approval (admin)
-- p_goals: [{category, theme, goal_type, label, prompt, target_value, unit}, ...]
-- ---------------------------------------------------------------------------
create or replace function public.submit_goals(p_goals jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  g     jsonb;
  v_cat public.goal_category;
  v_theme public.goal_theme;
  v_type  public.goal_type;
begin
  if not exists (select 1 from public.profiles
                 where id = v_uid and status = 'pending_approval' and role = 'participant') then
    raise exception 'GOALS_LOCKED';
  end if;
  if jsonb_array_length(p_goals) <> 5
     or (select count(distinct x ->> 'category') from jsonb_array_elements(p_goals) x) <> 5 then
    raise exception 'NEED_FIVE_GOALS';
  end if;

  delete from public.goals where user_id = v_uid;

  for g in select * from jsonb_array_elements(p_goals) loop
    v_cat   := (g ->> 'category')::public.goal_category;
    v_theme := (g ->> 'theme')::public.goal_theme;
    v_type  := (g ->> 'goal_type')::public.goal_type;

    -- Fixed shapes for the two required categories
    if v_cat = 'gym' then
      v_theme := 'gym'; v_type := 'binary';
    elsif v_cat = 'refraining' then
      v_theme := 'refraining'; v_type := 'inverse';
    elsif v_theme in ('gym', 'refraining') or v_type = 'inverse' then
      raise exception 'BAD_CUSTOM_GOAL';
    end if;
    if v_type <> 'percentage' and (g ->> 'target_value')::numeric > 7 then
      raise exception 'TARGET_OVER_7_DAYS';
    end if;

    insert into public.goals (user_id, category, theme, goal_type, label, prompt, target_value, unit, category_point_max)
    values (v_uid, v_cat, v_theme, v_type,
            trim(g ->> 'label'), trim(g ->> 'prompt'),
            (g ->> 'target_value')::numeric, trim(g ->> 'unit'),
            public.category_point_max(v_cat));
  end loop;
end $$;

-- Admin edits (optional) + approves a user's goals, activating the account.
-- p_goals: [{id, label, prompt, target_value, unit, goal_type?, theme?}, ...]
-- Also usable later to adjust an active user's goals.
create or replace function public.approve_goals(p_user uuid, p_goals jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  g jsonb;
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;

  for g in select * from jsonb_array_elements(coalesce(p_goals, '[]')) loop
    update public.goals set
      label        = coalesce(nullif(trim(g ->> 'label'), ''), label),
      prompt       = coalesce(nullif(trim(g ->> 'prompt'), ''), prompt),
      target_value = coalesce((g ->> 'target_value')::numeric, target_value),
      unit         = coalesce(nullif(trim(g ->> 'unit'), ''), unit),
      goal_type    = case when category in ('gym', 'refraining') then goal_type
                          else coalesce((g ->> 'goal_type')::public.goal_type, goal_type) end,
      theme        = case when category in ('gym', 'refraining') then theme
                          else coalesce((g ->> 'theme')::public.goal_theme, theme) end
    where id = (g ->> 'id')::uuid and user_id = p_user;
  end loop;

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

-- ---------------------------------------------------------------------------
-- Bonus challenges: an admin-set challenge wins; otherwise rotate through
-- the active presets deterministically by date.
-- ---------------------------------------------------------------------------
create or replace function public.ensure_bonus_challenge(p_date date)
returns public.bonus_challenges language plpgsql security definer set search_path = public as $$
declare
  v_row public.bonus_challenges;
  v_count int;
  v_desc text;
begin
  select * into v_row from public.bonus_challenges where challenge_date = p_date;
  if found then return v_row; end if;

  select count(*) into v_count from public.bonus_presets where active;
  if v_count = 0 then return null; end if;

  select description into v_desc from public.bonus_presets
   where active
   order by sort_order, created_at, id
   offset ((p_date - date '2026-01-05') % v_count + v_count) % v_count
   limit 1;

  insert into public.bonus_challenges (challenge_date, description, source)
  values (p_date, v_desc, 'auto')
  on conflict (challenge_date) do nothing;

  select * into v_row from public.bonus_challenges where challenge_date = p_date;
  return v_row;
end $$;

-- ---------------------------------------------------------------------------
-- Scoring engine
--   per category: min(actual / target, 1) × category_point_max
--   bands: green ≥ 80%, gray 60–79%, red < 60%
--   bonus: 7 per completed challenge, capped at 49
--   rank: total points desc, ties broken by number of green categories
-- ---------------------------------------------------------------------------
create or replace function public.compute_week(p_week date)
returns void language plpgsql security definer set search_path = public as $$
begin
  p_week := public.week_start(p_week);

  with participants as (
    select id from public.profiles where role = 'participant' and status = 'active'
  ),
  per_goal as (
    select g.user_id, g.category, g.target_value, g.category_point_max,
           coalesce(sum(case when g.goal_type = 'percentage' then e.value_reported
                             when e.value_reported > 0 then 1
                             else 0 end), 0) as actual
      from public.goals g
      join participants p on p.id = g.user_id
      left join public.daily_entries e
             on e.goal_id = g.id and e.entry_date between p_week and p_week + 6
     where g.status = 'approved'
     group by g.id
  ),
  banded as (
    select *,
           round(least(actual / target_value, 1.0) * category_point_max, 2) as points,
           least(actual / target_value, 1.0) as ratio
      from per_goal
  ),
  cat as (
    select user_id,
           jsonb_object_agg(category, jsonb_build_object(
             'points', points, 'actual', actual, 'target', target_value,
             'pct', round(ratio * 100), 'max', category_point_max,
             'band', case when ratio >= 0.8 then 'green' when ratio >= 0.6 then 'gray' else 'red' end
           )) as category_scores,
           jsonb_object_agg(category,
             case when ratio >= 0.8 then 'green' when ratio >= 0.6 then 'gray' else 'red' end) as bands,
           sum(points) as total_cat,
           count(*) filter (where ratio >= 0.8) as greens
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
     total_points, band_per_category, consistency_rank, is_top_this_week, updated_at)
  select user_id, p_week, category_scores, total_cat, bonus_pts,
         total, bands, rnk, (rnk = 1 and total > 0), now()
    from ranked
  on conflict (user_id, week_start_date) do update set
    category_scores       = excluded.category_scores,
    total_category_points = excluded.total_category_points,
    bonus_points          = excluded.bonus_points,
    total_points          = excluded.total_points,
    band_per_category     = excluded.band_per_category,
    consistency_rank      = excluded.consistency_rank,
    is_top_this_week      = excluded.is_top_this_week,
    updated_at            = now();

  -- Drop open-week rows for anyone no longer active (e.g. removed mid-week)
  delete from public.weekly_scores ws
   where ws.week_start_date = p_week and not ws.finalized
     and not exists (select 1 from public.profiles p
                     where p.id = ws.user_id and p.role = 'participant' and p.status = 'active');
end $$;

-- Close out a week: lock scores and create a punishment for every Red band.
-- Participants activated after the week began are exempt (partial week).
create or replace function public.finalize_week(p_week date)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_created int;
begin
  p_week := public.week_start(p_week);
  perform public.compute_week(p_week);

  update public.weekly_scores set finalized = true where week_start_date = p_week;

  insert into public.punishments
    (user_id, category, goal_id, week_start_date, punishment_description, proof_required, proof_type)
  select ws.user_id, b.key::public.goal_category, g.id, p_week,
         coalesce(lib.description, 'Punishment to be assigned — talk to your mentor.'),
         true,
         coalesce(lib.proof_type, 'mentor_conversation')
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
  return v_created;
end $$;

-- Called by pg_cron every Monday: finalizes the week that just ended.
create or replace function public.finalize_previous_week()
returns int language sql security definer set search_path = public as $$
  select public.finalize_week(public.week_start((now() at time zone 'UTC')::date) - 7);
$$;

-- ---------------------------------------------------------------------------
-- Daily check-in
-- ---------------------------------------------------------------------------
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
    'challenge', case when v_ch.id is null then null
                      else jsonb_build_object('id', v_ch.id, 'description', v_ch.description,
                                              'point_value', v_ch.point_value) end,
    'bonus_completed', (select completed from public.bonus_completions
                         where user_id = v_uid and bonus_challenge_id = v_ch.id),
    'entries', coalesce((select jsonb_agg(jsonb_build_object(
                           'goal_id', goal_id, 'value', value_reported,
                           'notes', notes, 'details', details, 'submitted_at', submitted_at))
                         from public.daily_entries
                         where user_id = v_uid and entry_date = v_date), '[]'::jsonb)
  );
end $$;

-- p_entries: [{goal_id, value, notes?, details?}]; p_bonus: true/false/null.
-- The entry date is always the caller's local "today" — past days can't be
-- written, and re-submitting today overwrites (same-day edits).
create or replace function public.submit_checkin(p_entries jsonb, p_bonus boolean)
returns date language plpgsql security definer set search_path = public as $$
declare
  v_uid  uuid := auth.uid();
  v_date date;
  e      jsonb;
  v_goal public.goals;
  v_val  numeric;
  v_ch   public.bonus_challenges;
begin
  if not exists (select 1 from public.profiles
                 where id = v_uid and status = 'active' and role = 'participant') then
    raise exception 'NOT_ACTIVE';
  end if;
  v_date := public.local_today(v_uid);

  for e in select * from jsonb_array_elements(p_entries) loop
    select * into v_goal from public.goals
     where id = (e ->> 'goal_id')::uuid and user_id = v_uid and status = 'approved';
    if not found then raise exception 'BAD_GOAL'; end if;

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

-- Lets any signed-in client make sure the current week has leaderboard rows
-- (e.g. on Monday morning before anyone has checked in).
create or replace function public.refresh_current_week()
returns date language plpgsql security definer set search_path = public as $$
declare
  v_week date := public.week_start(public.local_today(auth.uid()));
begin
  perform public.compute_week(v_week);
  return v_week;
end $$;

-- ---------------------------------------------------------------------------
-- Punishment proof & review
-- ---------------------------------------------------------------------------
-- p_path: storage path in the "proofs" bucket (null for a mentor conversation)
create or replace function public.submit_proof(p_punishment uuid, p_path text, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_p   public.punishments;
begin
  select * into v_p from public.punishments where id = p_punishment and user_id = v_uid;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_p.proof_status = 'accepted' then raise exception 'ALREADY_ACCEPTED'; end if;
  if p_path is not null and split_part(p_path, '/', 1) <> v_uid::text then
    raise exception 'BAD_PATH';
  end if;
  if p_path is null and v_p.proof_type <> 'mentor_conversation' then
    raise exception 'FILE_REQUIRED';
  end if;

  update public.punishments set
    proof_file_url     = p_path,
    proof_note         = nullif(trim(p_note), ''),
    proof_submitted_at = now(),
    proof_status       = 'pending'
  where id = p_punishment;
end $$;

-- Admin accepts or rejects proof. A rejection logs an infraction:
-- #1 → warning (mentor conversation), #2+ → admin decides on removal.
create or replace function public.review_proof(p_punishment uuid, p_accept boolean, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_p public.punishments;
  v_n int;
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  select * into v_p from public.punishments where id = p_punishment for update;
  if not found then raise exception 'NOT_FOUND'; end if;

  update public.punishments set
    proof_status = case when p_accept then 'accepted' else 'rejected' end::public.proof_status,
    reviewed_by  = auth.uid(),
    reviewed_at  = now(),
    review_note  = nullif(trim(p_note), '')
  where id = p_punishment;

  if not p_accept and not exists (select 1 from public.infractions where punishment_id = p_punishment) then
    select count(*) + 1 into v_n from public.infractions where user_id = v_p.user_id;
    insert into public.infractions (user_id, punishment_id, infraction_number, resolution, resolved_at)
    values (v_p.user_id, p_punishment, v_n,
            case when v_n = 1 then 'warning_given'::public.infraction_resolution end,
            case when v_n = 1 then now() end);
  end if;
end $$;

create or replace function public.acknowledge_infraction(p_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.infractions set acknowledged_at = coalesce(acknowledged_at, now())
   where id = p_id and user_id = auth.uid();
$$;

create or replace function public.remove_participant(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  update public.profiles set status = 'removed' where id = p_user and role = 'participant';
  update public.infractions
     set resolution = 'removed_and_refunded', resolved_at = now()
   where user_id = p_user and resolution is null;
  update public.notification_settings set enabled = false where user_id = p_user;
  perform public.compute_week(public.week_start((now() at time zone 'UTC')::date));
end $$;

-- Manual trigger for the admin dashboard (normally pg_cron does this).
create or replace function public.admin_finalize_week(p_week date)
returns int language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  return public.finalize_week(p_week);
end $$;

-- ---------------------------------------------------------------------------
-- Admin directory: one row per participant with everything the People tab needs
-- ---------------------------------------------------------------------------
create or replace function public.admin_directory()
returns table (
  id uuid, username text, display_name text, email text,
  role public.user_role, status public.user_status,
  created_at timestamptz, activated_at timestamptz, timezone text,
  infraction_count int, open_infraction boolean, pending_proofs int,
  notif_enabled boolean, has_push boolean, reminder_time time,
  last_checkin date
) language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  return query
  select p.id, p.username, p.display_name, p.email, p.role, p.status,
         p.created_at, p.activated_at, p.timezone,
         (select count(*)::int from public.infractions i where i.user_id = p.id),
         exists (select 1 from public.infractions i where i.user_id = p.id and i.resolution is null),
         (select count(*)::int from public.punishments pu
           where pu.user_id = p.id and pu.proof_status = 'pending' and pu.proof_submitted_at is not null),
         coalesce(n.enabled, false),
         n.push_subscription is not null,
         n.reminder_time,
         (select max(e.entry_date) from public.daily_entries e where e.user_id = p.id)
    from public.profiles p
    left join public.notification_settings n on n.user_id = p.id
   order by p.status, p.display_name;
end $$;

-- ---------------------------------------------------------------------------
-- Function privileges. Supabase grants EXECUTE to PUBLIC by default; lock
-- the internal ones down and expose only what clients should call.
-- ---------------------------------------------------------------------------
revoke execute on function public.compute_week(date)          from public, anon, authenticated;
revoke execute on function public.finalize_week(date)         from public, anon, authenticated;
revoke execute on function public.finalize_previous_week()    from public, anon, authenticated;
revoke execute on function public.handle_new_user()           from public, anon, authenticated;
revoke execute on function public.ensure_bonus_challenge(date) from public, anon;
revoke execute on function public.local_today(uuid)           from public, anon;

grant execute on function public.check_signup(text, text) to anon, authenticated;
grant execute on function public.ensure_bonus_challenge(date) to authenticated;
