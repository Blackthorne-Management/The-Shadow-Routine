-- ============================================================================
-- Mentors are linked to cohorts
--
--   cohort_mentors: which staff mentor which cohort. A Mentor sees, approves,
--   reviews and gets alerts only for people in the cohorts they mentor.
--   Admins see every cohort and choose which (if any) they mentor.
--   Mentor alerts go to the cohort's mentors; if a cohort has none, to Admins.
--   Admins create/rename cohorts, assign mentors and move people between them.
--   profiles.is_mentor is kept in sync (= mentors at least one cohort).
-- ============================================================================

create unique index cohorts_name_key on public.cohorts (lower(name));

create table public.cohort_mentors (
  cohort_id  uuid not null references public.cohorts (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (cohort_id, user_id)
);
create index cohort_mentors_user_idx on public.cohort_mentors (user_id);
alter table public.cohort_mentors enable row level security;
-- Everyone can see who mentors which cohort; changes go through the functions below
create policy cohort_mentors_read on public.cohort_mentors for select to authenticated using (true);

-- Existing mentoring staff mentor the cohort they're in
insert into public.cohort_mentors (cohort_id, user_id)
select p.cohort_id, p.id from public.profiles p
 where p.role = 'admin' and p.status = 'active' and p.is_mentor and p.cohort_id is not null
on conflict do nothing;

-- is_mentor now follows the links (the old "Mentors are always mentors" guard goes)
drop trigger profiles_mentor_guard on public.profiles;
drop function public.profiles_mentor_guard();
update public.profiles p set is_mentor = exists (select 1 from public.cohort_mentors cm where cm.user_id = p.id)
 where p.role = 'admin';

create or replace function public.cohort_mentors_sync()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_user uuid := coalesce(new.user_id, old.user_id);
begin
  update public.profiles set is_mentor = exists (select 1 from public.cohort_mentors where user_id = v_user)
   where id = v_user;
  return null;
end $$;
create trigger cohort_mentors_sync after insert or delete on public.cohort_mentors
  for each row execute function public.cohort_mentors_sync();

-- ---------------------------------------------------------------------------
-- Who can see whom
-- ---------------------------------------------------------------------------
-- The current user is active staff and mentors this cohort
create or replace function public.mentors_cohort(p_cohort uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.cohort_mentors cm
                   join public.profiles me on me.id = cm.user_id
                  where cm.user_id = auth.uid() and cm.cohort_id = p_cohort
                    and me.role = 'admin' and me.status = 'active');
$$;

-- Admins: every cohort. Mentors: the cohorts they mentor.
create or replace function public.staff_in_cohort(p_cohort uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_super_admin() or public.mentors_cohort(p_cohort);
$$;

-- Staff may see/act on this person's data
create or replace function public.staff_can_see(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_super_admin()
      or exists (select 1 from public.profiles p where p.id = p_user and public.mentors_cohort(p.cohort_id));
$$;

-- Same, from a storage path's first folder (a user id)
create or replace function public.staff_can_see_path(p_folder text)
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  return public.staff_can_see(p_folder::uuid);
exception when others then
  return public.is_super_admin();
end $$;

-- Per-person data: yours, or staff who can see you
alter policy completions_read  on public.bonus_completions     using (user_id = auth.uid() or public.staff_can_see(user_id));
alter policy consequences_read on public.consequences          using (user_id = auth.uid() or public.staff_can_see(user_id));
alter policy entries_read      on public.daily_entries         using (user_id = auth.uid() or public.staff_can_see(user_id));
alter policy goals_read        on public.goals                 using (user_id = auth.uid() or public.staff_can_see(user_id));
alter policy infractions_read  on public.infractions           using (user_id = auth.uid() or public.staff_can_see(user_id));
alter policy monthly_read      on public.monthly_results       using (user_id = auth.uid() or public.staff_can_see(user_id));
alter policy notif_read        on public.notification_settings using (user_id = auth.uid() or public.staff_can_see(user_id));
alter policy punishments_read  on public.punishments           using (user_id = auth.uid() or public.staff_can_see(user_id));
alter policy rewards_read      on public.rewards               using (user_id = auth.uid() or public.staff_can_see(user_id));
alter policy workouts_read     on public.workouts              using (user_id = auth.uid() or public.staff_can_see(user_id));
alter policy proofs_read_own_or_admin on storage.objects
  using (bucket_id = 'proofs'
         and ((storage.foldername(name))[1] = auth.uid()::text or public.staff_can_see_path((storage.foldername(name))[1])));

-- Cohort chat: members, the cohort's mentors, and Admins
drop policy messages_read on public.messages;
drop policy messages_post on public.messages;
drop policy messages_delete on public.messages;
create policy messages_read on public.messages for select to authenticated
  using (case channel
           when 'dm'     then user_id = auth.uid() or recipient_id = auth.uid() or public.is_super_admin()
           when 'cohort' then cohort_id = public.my_chat_cohort() or public.staff_in_cohort(cohort_id)
           else               public.is_admin() or public.my_chat_cohort() is not null
         end);
create policy messages_post on public.messages for insert to authenticated
  with check (user_id = auth.uid() and (
    (channel = 'cohort' and (cohort_id = public.my_chat_cohort() or public.staff_in_cohort(cohort_id)))
    or (channel = 'global' and cohort_id is null and (public.my_chat_cohort() is not null or public.is_admin()))
    or (channel = 'dm' and cohort_id is null and public.can_dm(recipient_id))));
create policy messages_delete on public.messages for delete to authenticated
  using (case channel
           when 'dm'     then user_id = auth.uid() or public.is_super_admin()
           when 'cohort' then public.staff_in_cohort(cohort_id)
           else               public.is_admin()
         end);

-- ---------------------------------------------------------------------------
-- Staff actions on a person: only for people you can see
-- ---------------------------------------------------------------------------
do $$
declare
  r   record;
  def text;
begin
  for r in select * from (values
    ('public.approve_goals(uuid,jsonb,jsonb)',
       'if not public.is_admin() then raise exception ''ADMIN_ONLY''; end if;',
       'if not public.staff_can_see(p_user) then raise exception ''ADMIN_ONLY''; end if;'),
    ('public.review_workout(uuid,boolean,text)',
       'if not public.is_admin() then raise exception ''ADMIN_ONLY''; end if;',
       'if not public.staff_can_see((select w.user_id from public.workouts w where w.id = p_id)) then raise exception ''ADMIN_ONLY''; end if;'),
    ('public.review_proof(uuid,boolean,text)',
       'if not public.is_admin() then raise exception ''ADMIN_ONLY''; end if;',
       'if not public.staff_can_see((select pu.user_id from public.punishments pu where pu.id = p_punishment)) then raise exception ''ADMIN_ONLY''; end if;'),
    ('public.month_status(uuid)',
       'and not public.is_admin() then raise exception ''NOT_ALLOWED''',
       'and not public.staff_can_see(v_uid) then raise exception ''NOT_ALLOWED'''),
    ('public.set_rank_path(text,uuid)',
       'if v_uid is distinct from auth.uid() and not public.is_admin() then',
       'if v_uid is distinct from auth.uid() and not public.staff_can_see(v_uid) then'),
    ('public.admin_directory()',
       'left join public.notification_settings n on n.user_id = p.id',
       'left join public.notification_settings n on n.user_id = p.id
   where public.staff_can_see(p.id)'),
    -- Mentor alerts go to the person's cohort mentors (Admins if there are none)
    ('public.on_goals_submitted()',     'public.notify_admins(', 'public.notify_cohort_mentors(new.user_id, '),
    ('public.on_workout_change()',      'public.notify_admins(', 'public.notify_cohort_mentors(new.user_id, '),
    ('public.on_punishment_change()',   'public.notify_admins(', 'public.notify_cohort_mentors(new.user_id, ')
  ) as v(fn, find, repl) loop
    def := pg_get_functiondef(r.fn::regprocedure);
    if position(r.find in def) = 0 then raise exception 'pattern not found in %: %', r.fn, r.find; end if;
    -- notify_cohort_mentors is created below; plpgsql resolves calls at run time
    execute replace(def, r.find, r.repl);
  end loop;
end $$;

create or replace function public.notify_cohort_mentors(p_user uuid, p_type text, p_title text, p_body text,
                                                        p_url text, p_dedupe text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  a   record;
  v_n int := 0;
begin
  for a in select cm.user_id from public.profiles p
             join public.cohort_mentors cm on cm.cohort_id = p.cohort_id
             join public.profiles s on s.id = cm.user_id
            where p.id = p_user and s.role = 'admin' and s.status = 'active' loop
    perform public.notify(a.user_id, p_type, p_title, p_body, p_url, p_dedupe);
    v_n := v_n + 1;
  end loop;
  if v_n = 0 then  -- nobody mentors this cohort: the Admins hear about it
    for a in select id from public.profiles where role = 'admin' and is_super_admin and status = 'active' loop
      perform public.notify(a.id, p_type, p_title, p_body, p_url, p_dedupe);
    end loop;
  end if;
end $$;

create or replace function public.admin_pending_counts()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  return jsonb_build_object(
    'approvals', (select count(*) from public.profiles p
                   where p.role = 'participant' and p.status = 'pending_approval' and public.staff_can_see(p.id)
                     and exists (select 1 from public.consequences c where c.user_id = p.id)),
    'workouts',  (select count(*) from public.workouts w
                   where w.status = 'exception_pending' and public.staff_can_see(w.user_id)),
    'proofs',    (select count(*) from public.punishments pu
                   where pu.proof_status = 'pending' and pu.proof_submitted_at is not null
                     and public.staff_can_see(pu.user_id)));
end $$;

-- Cohort chat notifications: the cohort, its mentors, and Admins
create or replace function public.on_message_posted()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_name   text;
  v_cohort text;
  r        record;
begin
  if new.channel = 'dm' then
    select display_name into v_name from public.profiles where id = new.user_id;
    perform public.notify(new.recipient_id, 'direct_messages', v_name, new.message_text, '/chat/dm/' || new.user_id);
    return new;
  end if;
  select case when role = 'admin' then (case when is_super_admin then 'Admin' else 'Mentor' end) else display_name end
    into v_name from public.profiles where id = new.user_id;
  select name into v_cohort from public.cohorts where id = new.cohort_id;
  for r in
    select p.id from public.profiles p
     where p.id <> new.user_id and p.status = 'active'
       and (new.channel = 'global'
            or p.cohort_id = new.cohort_id
            or (p.role = 'admin' and (p.is_super_admin
                or exists (select 1 from public.cohort_mentors cm where cm.user_id = p.id and cm.cohort_id = new.cohort_id))))
  loop
    perform public.notify(r.id,
      case when new.channel = 'global' then 'global_messages' else 'cohort_messages' end,
      case when new.channel = 'global' then 'Everyone' else coalesce(v_cohort, 'Cohort') end || ' · ' || v_name,
      new.message_text,
      case when new.channel = 'global' then '/chat?c=global' else '/chat' end);
  end loop;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Invites carry a cohort: participants join it, mentors mentor it
-- ---------------------------------------------------------------------------
alter table public.invite_codes add column cohort_id uuid references public.cohorts (id) on delete set null;
update public.invite_codes set cohort_id = public.default_cohort() where role in ('participant', 'mentor') and cohort_id is null;

drop policy invites_read on public.invite_codes;
drop policy invites_insert on public.invite_codes;
drop policy invites_update on public.invite_codes;
drop policy invites_delete on public.invite_codes;
create policy invites_read on public.invite_codes for select to authenticated
  using (public.is_admin() and (public.is_super_admin() or created_by = auth.uid()
                                or (cohort_id is not null and public.mentors_cohort(cohort_id))));
create policy invites_insert on public.invite_codes for insert to authenticated
  with check (public.is_super_admin()
              or (public.is_admin() and role = 'participant' and cohort_id is not null and public.mentors_cohort(cohort_id)));
create policy invites_update on public.invite_codes for update to authenticated
  using (public.is_super_admin()
         or (public.is_admin() and role = 'participant' and cohort_id is not null and public.mentors_cohort(cohort_id)))
  with check (public.is_super_admin()
              or (public.is_admin() and role = 'participant' and cohort_id is not null and public.mentors_cohort(cohort_id)));
create policy invites_delete on public.invite_codes for delete to authenticated
  using (public.is_super_admin()
         or (public.is_admin() and role = 'participant' and cohort_id is not null and public.mentors_cohort(cohort_id)));

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_code     text := upper(trim(coalesce(new.raw_user_meta_data ->> 'invite_code', '')));
  v_username text := lower(trim(coalesce(new.raw_user_meta_data ->> 'username', '')));
  v_display  text := coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), v_username);
  v_tz       text := coalesce(nullif(new.raw_user_meta_data ->> 'timezone', ''), 'UTC');
  v_sex      text := nullif(new.raw_user_meta_data ->> 'sex', '');
  v_invite   public.invite_codes;
  v_cohort   uuid;
begin
  select * into v_invite from public.invite_codes
   where code = v_code and status = 'unused'
   for update;
  if v_invite.id is null then
    raise exception 'INVALID_INVITE_CODE';
  end if;
  if not public.valid_timezone(v_tz) then v_tz := 'UTC'; end if;
  if v_sex not in ('male', 'female') then v_sex := null; end if;
  v_cohort := coalesce(v_invite.cohort_id, public.default_cohort());

  if v_invite.role in ('mentor', 'admin') then
    insert into public.profiles (id, email, username, display_name, invite_code_used, timezone, sex,
                                 role, status, activated_at, is_super_admin, cohort_id, is_mentor)
    values (new.id, new.email, v_username, v_display, v_code, v_tz, v_sex, 'admin', 'active', now(),
            v_invite.role = 'admin', v_cohort, false);
    if v_invite.role = 'mentor' then
      insert into public.cohort_mentors (cohort_id, user_id) values (v_cohort, new.id);
    end if;
  else
    insert into public.profiles (id, email, username, display_name, invite_code_used, timezone, sex, cohort_id)
    values (new.id, new.email, v_username, v_display, v_code, v_tz, v_sex, v_cohort);
  end if;

  update public.invite_codes
     set status = 'used', used_by = new.id, used_at = now()
   where id = v_invite.id;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Admin tools
-- ---------------------------------------------------------------------------
create or replace function public.create_cohort(p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.is_super_admin() then raise exception 'ADMIN_ONLY'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'NAME_REQUIRED'; end if;
  insert into public.cohorts (name) values (trim(p_name)) returning id into v_id;
  return v_id;
exception when unique_violation then
  raise exception 'NAME_TAKEN';
end $$;

create or replace function public.rename_cohort(p_cohort uuid, p_name text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'ADMIN_ONLY'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'NAME_REQUIRED'; end if;
  update public.cohorts set name = trim(p_name) where id = p_cohort;
exception when unique_violation then
  raise exception 'NAME_TAKEN';
end $$;

-- Link/unlink a mentor (any staff member, including yourself)
create or replace function public.set_cohort_mentor(p_cohort uuid, p_user uuid, p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'ADMIN_ONLY'; end if;
  if not exists (select 1 from public.profiles where id = p_user and role = 'admin' and status = 'active') then
    raise exception 'NOT_STAFF';
  end if;
  if p_on then
    insert into public.cohort_mentors (cohort_id, user_id) values (p_cohort, p_user) on conflict do nothing;
  else
    delete from public.cohort_mentors where cohort_id = p_cohort and user_id = p_user;
  end if;
end $$;

-- Move a participant (or a checking-in staff member) to another cohort
create or replace function public.move_to_cohort(p_user uuid, p_cohort uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'ADMIN_ONLY'; end if;
  if not exists (select 1 from public.cohorts where id = p_cohort) then raise exception 'NO_SUCH_COHORT'; end if;
  update public.profiles set cohort_id = p_cohort where id = p_user;
end $$;

-- Kept for older app versions: "I'm a mentor" = mentor my own cohort (or none)
create or replace function public.set_is_mentor(p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'ADMIN_ONLY'; end if;
  if p_on then
    insert into public.cohort_mentors (cohort_id, user_id)
    select cohort_id, id from public.profiles where id = auth.uid() and cohort_id is not null
    on conflict do nothing;
  else
    delete from public.cohort_mentors where user_id = auth.uid();
  end if;
  update public.profiles set is_mentor = exists (select 1 from public.cohort_mentors where user_id = auth.uid())
   where id = auth.uid();
end $$;

-- Old fan-out (every mentoring staff member) is replaced by notify_cohort_mentors
create or replace function public.notify_admins(p_type text, p_title text, p_body text, p_url text,
                                                p_dedupe text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  a record;
  v_any_mentor boolean := exists (select 1 from public.profiles
                                   where role = 'admin' and status = 'active' and is_mentor);
begin
  for a in select id from public.profiles
            where role = 'admin' and status = 'active' and (is_mentor or (not v_any_mentor and is_super_admin)) loop
    perform public.notify(a.id, p_type, p_title, p_body, p_url, p_dedupe);
  end loop;
end $$;

revoke execute on function public.cohort_mentors_sync()                               from public, anon, authenticated;
revoke execute on function public.mentors_cohort(uuid)                                from public, anon;
revoke execute on function public.staff_in_cohort(uuid)                               from public, anon;
revoke execute on function public.staff_can_see(uuid)                                 from public, anon;
revoke execute on function public.staff_can_see_path(text)                            from public, anon;
revoke execute on function public.notify_cohort_mentors(uuid, text, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.create_cohort(text)                                 from public, anon;
revoke execute on function public.rename_cohort(uuid, text)                           from public, anon;
revoke execute on function public.set_cohort_mentor(uuid, uuid, boolean)              from public, anon;
revoke execute on function public.move_to_cohort(uuid, uuid)                          from public, anon;
