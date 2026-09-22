-- ============================================================================
-- Rank paths, cumulative levels, emblems, and cohort chat
-- (PENDING_UPDATES.md items 9–12)
--
--   Sex (male/female) only picks the rank-title path; nothing else uses it.
--   cumulative_cycle_points = sum of weekly total_points over program weeks
--   1–10 (max 10 × 1,049 = 10,490). Separate from the weekly leaderboard.
--   Chat is scoped to a cohort. There's one cohort today; the table is here
--   for the future multi-cohort build.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Cohorts
-- ---------------------------------------------------------------------------
create table public.cohorts (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);
insert into public.cohorts (name) values ('Cohort 1');
alter table public.cohorts enable row level security;
create policy cohorts_read on public.cohorts for select to authenticated using (true);

create or replace function public.default_cohort()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.cohorts order by created_at, id limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Profile additions
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column sex                    text check (sex in ('male', 'female')),
  add column cohort_id              uuid references public.cohorts (id) default public.default_cohort(),
  add column cumulative_cycle_points numeric not null default 0,
  add column rank_level             int not null default 1 check (rank_level between 1 and 10);
update public.profiles set cohort_id = public.default_cohort() where cohort_id is null;

-- Visible to the cohort (leaderboard emblems, chat); still no email
grant select (sex, cohort_id, cumulative_cycle_points, rank_level) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Levels
-- ---------------------------------------------------------------------------
create or replace function public.rank_for(points numeric)
returns int language sql immutable set search_path = '' as $$
  select case
    when points >= 10490 then 10
    when points >= 8935  then 9
    when points >= 7450  then 8
    when points >= 6035  then 7
    when points >= 4710  then 6
    when points >= 3475  then 5
    when points >= 2350  then 4
    when points >= 1350  then 3
    when points >= 525   then 2
    else 1
  end;
$$;

-- Emblem art per level and path. Real artwork gets dropped in via image_url;
-- until then the app draws a placeholder.
create table public.emblems (
  rank_level int  not null check (rank_level between 1 and 10),
  path       text not null check (path in ('male', 'female', 'shared')),
  title      text not null,
  threshold  int  not null,
  image_url  text,
  primary key (rank_level, path),
  check ((rank_level = 10) = (path = 'shared'))
);
insert into public.emblems (rank_level, path, title, threshold) values
  (1, 'male', 'Shadow Initiate', 0),        (1, 'female', 'Shadow Initiate', 0),
  (2, 'male', 'Shadow Apprentice', 525),    (2, 'female', 'Shadow Apprentice', 525),
  (3, 'male', 'Shadow Ronin', 1350),        (3, 'female', 'Shadow Huntress', 1350),
  (4, 'male', 'Shadow Blade', 2350),        (4, 'female', 'Shadow Oracle', 2350),
  (5, 'male', 'Shadow Berserker', 3475),    (5, 'female', 'Shadow Valkyrie', 3475),
  (6, 'male', 'Shadow Marshal', 4710),      (6, 'female', 'Shadow Matriarch', 4710),
  (7, 'male', 'Shadow Warlord', 6035),      (7, 'female', 'Shadow Empress', 6035),
  (8, 'male', 'Shadow Regent', 7450),       (8, 'female', 'Shadow Sovereign', 7450),
  (9, 'male', 'Shadow King', 8935),         (9, 'female', 'Shadow Queen', 8935),
  (10, 'shared', 'The Eclipse', 10490);
alter table public.emblems enable row level security;
create policy emblems_read on public.emblems for select to authenticated using (true);
create policy emblems_admin on public.emblems for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Recompute one or all participants' cycle totals. Program weeks 1–10 only;
-- with no program date set, every week counts.
create or replace function public.refresh_cumulative(p_user uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_start date := public.program_start();
begin
  update public.profiles p set
    cumulative_cycle_points = t.pts,
    rank_level              = public.rank_for(t.pts)
  from (
    select pr.id,
           coalesce((select sum(ws.total_points) from public.weekly_scores ws
                      where ws.user_id = pr.id
                        and (v_start is null or ws.week_start_date between v_start and v_start + 63)), 0) as pts
      from public.profiles pr
     where pr.role = 'participant' and (p_user is null or pr.id = p_user)
  ) t
  where p.id = t.id
    and (p.cumulative_cycle_points, p.rank_level) is distinct from (t.pts, public.rank_for(t.pts));
end $$;

-- Scores change in compute_week; keep the cycle totals in step with them
create or replace function public.weekly_scores_touch_cumulative()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.refresh_cumulative(coalesce(new.user_id, old.user_id));
  return null;
end $$;
create trigger weekly_scores_cumulative
  after insert or update of total_points or delete on public.weekly_scores
  for each row execute function public.weekly_scores_touch_cumulative();

-- A new program start date changes which weeks count
create or replace function public.admin_set_program_start(p_date date)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  if p_date is not null and extract(isodow from p_date) <> 1 then raise exception 'MUST_BE_MONDAY'; end if;
  update public.program_settings set start_date = p_date, updated_at = now() where id = 1;
  perform public.refresh_cumulative(null);
end $$;

-- ---------------------------------------------------------------------------
-- Rank path: chosen at signup; existing accounts pick once. Admin can change it.
-- ---------------------------------------------------------------------------
create or replace function public.set_rank_path(p_sex text, p_user uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := coalesce(p_user, auth.uid());
begin
  if p_sex not in ('male', 'female') then raise exception 'BAD_SEX'; end if;
  if v_uid is distinct from auth.uid() and not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  if not public.is_admin() and exists (select 1 from public.profiles where id = v_uid and sex is not null) then
    raise exception 'PATH_LOCKED';
  end if;
  update public.profiles set sex = p_sex where id = v_uid;
end $$;

-- Signup now takes sex from the metadata too
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_code     text := upper(trim(coalesce(new.raw_user_meta_data ->> 'invite_code', '')));
  v_username text := lower(trim(coalesce(new.raw_user_meta_data ->> 'username', '')));
  v_display  text := coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), v_username);
  v_tz       text := coalesce(nullif(new.raw_user_meta_data ->> 'timezone', ''), 'UTC');
  v_sex      text := nullif(new.raw_user_meta_data ->> 'sex', '');
  v_invite   uuid;
begin
  select id into v_invite from public.invite_codes
   where code = v_code and status = 'unused'
   for update;
  if v_invite is null then
    raise exception 'INVALID_INVITE_CODE';
  end if;
  if not public.valid_timezone(v_tz) then v_tz := 'UTC'; end if;
  if v_sex not in ('male', 'female') then v_sex := null; end if;

  insert into public.profiles (id, email, username, display_name, invite_code_used, timezone, sex)
  values (new.id, new.email, v_username, v_display, v_code, v_tz, v_sex);

  update public.invite_codes
     set status = 'used', used_by = new.id, used_at = now()
   where id = v_invite;
  return new;
end $$;

-- (No guard changes needed: sex, cumulative_cycle_points, rank_level and
-- cohort_id have no UPDATE grant for participants; set_rank_path is the way in.)

-- ---------------------------------------------------------------------------
-- Cohort chat
-- ---------------------------------------------------------------------------
create table public.messages (
  id           uuid primary key default gen_random_uuid(),
  cohort_id    uuid not null references public.cohorts (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  message_text text not null check (char_length(trim(message_text)) between 1 and 1000),
  created_at   timestamptz not null default now()
);
create index messages_cohort_time_idx on public.messages (cohort_id, created_at desc);
alter table public.messages enable row level security;

create or replace function public.my_chat_cohort()
returns uuid language sql stable security definer set search_path = public as $$
  select cohort_id from public.profiles
   where id = auth.uid() and status = 'active';
$$;

-- Active members read their cohort's chat; the admin reads every cohort
create policy messages_read on public.messages for select to authenticated
  using (cohort_id = public.my_chat_cohort() or public.is_admin());
-- Post only as yourself, into your own cohort (the admin can post anywhere)
create policy messages_post on public.messages for insert to authenticated
  with check (user_id = auth.uid() and (cohort_id = public.my_chat_cohort() or public.is_admin()));
-- Moderation: only the admin deletes
create policy messages_delete on public.messages for delete to authenticated
  using (public.is_admin());
revoke update on public.messages from authenticated, anon;

alter publication supabase_realtime add table public.messages;
-- Deletes need the full old row so subscribers know which message went away
alter table public.messages replica identity full;

-- ---------------------------------------------------------------------------
-- Privileges + backfill
-- ---------------------------------------------------------------------------
revoke execute on function public.refresh_cumulative(uuid)             from public, anon, authenticated;
revoke execute on function public.weekly_scores_touch_cumulative()     from public, anon, authenticated;
revoke execute on function public.default_cohort()                     from public, anon;
revoke execute on function public.my_chat_cohort()                     from public, anon;
revoke execute on function public.set_rank_path(text, uuid)            from public, anon;
revoke execute on function public.admin_set_program_start(date)        from public, anon;

select public.refresh_cumulative(null);
