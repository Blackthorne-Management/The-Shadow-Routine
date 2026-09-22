-- ============================================================================
-- Notifications for app events + a global chat channel
--
--   Events → public.notify() → a row in public.notifications (in-app inbox),
--   only if the recipient's preference for that type is on. Each new row is
--   pushed right away: a trigger calls the send-reminders Edge Function with
--   {notification_id} through pg_net (same function, keys and secret as the
--   nightly reminder).
--
--   Preferences live in notification_settings.prefs ({type: bool}); a missing
--   key uses the default (everything on except global chat).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Global chat: messages belong to a cohort channel or the global channel
-- ---------------------------------------------------------------------------
alter table public.messages
  add column channel text not null default 'cohort' check (channel in ('cohort', 'global'));
alter table public.messages alter column cohort_id drop not null;
alter table public.messages
  add constraint messages_channel_cohort check ((channel = 'global') = (cohort_id is null));
create index messages_global_time_idx on public.messages (created_at desc) where channel = 'global';

drop policy messages_read on public.messages;
drop policy messages_post on public.messages;
-- Cohort channel: your own cohort. Global channel: any active member. Admin: everything.
create policy messages_read on public.messages for select to authenticated
  using (public.is_admin()
         or (channel = 'cohort' and cohort_id = public.my_chat_cohort())
         or (channel = 'global' and public.my_chat_cohort() is not null));
create policy messages_post on public.messages for insert to authenticated
  with check (user_id = auth.uid() and (
    (channel = 'cohort' and (cohort_id = public.my_chat_cohort() or public.is_admin()))
    or (channel = 'global' and cohort_id is null and (public.my_chat_cohort() is not null or public.is_admin()))));

-- ---------------------------------------------------------------------------
-- Preferences
-- ---------------------------------------------------------------------------
alter table public.notification_settings add column prefs jsonb not null default '{}';
grant update (prefs) on public.notification_settings to authenticated;

create or replace function public.notification_default(p_type text)
returns boolean language sql immutable set search_path = '' as $$
  select p_type <> 'global_messages';
$$;

create or replace function public.wants_notification(p_user uuid, p_type text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select (n.prefs ->> p_type)::boolean from public.notification_settings n where n.user_id = p_user),
                  public.notification_default(p_type));
$$;

-- ---------------------------------------------------------------------------
-- The inbox
-- ---------------------------------------------------------------------------
create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  type       text not null,
  title      text not null,
  body       text,
  url        text not null default '/',
  dedupe_key text,             -- stops repeats (e.g. re-saving a check-in)
  created_at timestamptz not null default now(),
  read_at    timestamptz
);
create index notifications_user_time_idx on public.notifications (user_id, created_at desc);
create unique index notifications_dedupe on public.notifications (user_id, dedupe_key) where dedupe_key is not null;
alter table public.notifications enable row level security;
create policy notifications_read on public.notifications for select to authenticated using (user_id = auth.uid());
alter publication supabase_realtime add table public.notifications;

create or replace function public.notify(p_user uuid, p_type text, p_title text, p_body text, p_url text,
                                         p_dedupe text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user is null or not public.wants_notification(p_user, p_type) then return; end if;
  insert into public.notifications (user_id, type, title, body, url, dedupe_key)
  values (p_user, p_type, p_title, left(p_body, 180), coalesce(p_url, '/'), p_dedupe)
  on conflict do nothing;
end $$;

create or replace function public.notify_admins(p_type text, p_title text, p_body text, p_url text,
                                                p_dedupe text default null)
returns void language plpgsql security definer set search_path = public as $$
declare a record;
begin
  for a in select id from public.profiles where role = 'admin' and status = 'active' loop
    perform public.notify(a.id, p_type, p_title, p_body, p_url, p_dedupe);
  end loop;
end $$;

create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns void language sql security definer set search_path = public as $$
  update public.notifications set read_at = now()
   where user_id = auth.uid() and read_at is null and (p_ids is null or id = any (p_ids));
$$;

-- ---------------------------------------------------------------------------
-- Push delivery: each new inbox row is sent immediately (if the user has push on)
-- ---------------------------------------------------------------------------
create or replace function public.push_notification()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if to_regproc('net.http_post') is null then return new; end if;  -- pg_net not installed (local tests)
  if not exists (select 1 from public.notification_settings n
                  where n.user_id = new.user_id and n.enabled and n.push_subscription is not null) then
    return new;
  end if;
  perform net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/send-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json',
                 'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    body    := jsonb_build_object('notification_id', new.id),
    timeout_milliseconds := 15000);
  return new;
end $$;
create trigger notifications_push after insert on public.notifications
  for each row execute function public.push_notification();

-- ---------------------------------------------------------------------------
-- Events
-- ---------------------------------------------------------------------------

-- Goals submitted (the participant saves their consequences last in submit_goals)
create or replace function public.on_goals_submitted()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  if new.user_id is distinct from auth.uid() then return new; end if;  -- admin edits don't count
  select display_name into v_name from public.profiles where id = new.user_id and status = 'pending_approval';
  if v_name is null then return new; end if;
  perform public.notify_admins('admin_goal_submissions', 'Goals waiting for approval',
    v_name || ' submitted their 5 goals and consequences.', '/admin/approvals');
  return new;
end $$;
create trigger consequences_submitted after insert or update on public.consequences
  for each row execute function public.on_goals_submitted();

-- Approved → active
create or replace function public.on_profile_activated()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'pending_approval' and new.status = 'active' and new.role = 'participant' then
    perform public.notify(new.id, 'approvals', 'You''re approved',
      'Your goals were approved. Set your nightly reminder and start checking in.', '/');
  end if;
  return new;
end $$;
create trigger profiles_activated after update of status on public.profiles
  for each row execute function public.on_profile_activated();

-- Workouts: mentor decisions → participant; new "no photo" asks → admins
create or replace function public.on_workout_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  if tg_op = 'INSERT' then
    if new.status = 'exception_pending' then
      select display_name into v_name from public.profiles where id = new.user_id;
      perform public.notify_admins('admin_exceptions', 'No-photo workout to review',
        v_name || ': ' || new.workout_type || ', ' || new.minutes || ' min. "' || coalesce(new.exception_note, '') || '"',
        '/admin/workouts',
        'exception:' || new.user_id || ':' || new.entry_date || ':' || md5(coalesce(new.exception_note, '')));
    end if;
  elsif new.reviewed_at is distinct from old.reviewed_at and new.reviewed_by is not null then
    perform public.notify(new.user_id, 'workout_reviews',
      case new.status when 'rejected' then 'Workout not counted'
                      when 'exception_accepted' then 'Workout accepted'
                      else 'Workout restored' end,
      new.workout_type || ' on ' || to_char(new.entry_date, 'Mon DD')
        || case when new.status = 'rejected' then ' was rejected by your mentor' else ' counts toward your week' end
        || coalesce('. "' || new.review_note || '"', '.'),
      '/');
  end if;
  return new;
end $$;
create trigger workouts_notify after insert or update on public.workouts
  for each row execute function public.on_workout_change();

-- Punishments: issued → participant; proof submitted → admins; reviewed → participant
create or replace function public.on_punishment_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  if tg_op = 'INSERT' then
    perform public.notify(new.user_id, 'punishments',
      case when new.kind = 'ultra' then 'Ultra Punishment' else 'Red week: punishment due' end,
      new.punishment_description, '/punishment/' || new.id);
    return new;
  end if;
  if new.proof_submitted_at is distinct from old.proof_submitted_at and new.proof_submitted_at is not null then
    select display_name into v_name from public.profiles where id = new.user_id;
    perform public.notify_admins('admin_proofs', 'Punishment proof to review',
      v_name || ': ' || new.punishment_description, '/admin/proofs');
  end if;
  if new.reviewed_at is distinct from old.reviewed_at and new.proof_status <> 'pending' then
    perform public.notify(new.user_id, 'proof_reviews',
      case when new.proof_status = 'accepted' then 'Proof accepted' else 'Proof rejected' end,
      case when new.proof_status = 'accepted' then 'You''re clear: ' || new.punishment_description
           else coalesce(new.review_note || '. ', '') || 'Talk to your mentor.' end,
      '/punishment/' || new.id);
  end if;
  return new;
end $$;
create trigger punishments_notify after insert or update on public.punishments
  for each row execute function public.on_punishment_change();

-- Rewards earned
create or replace function public.on_reward_earned()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.notify(new.user_id, 'rewards',
    case new.kind when 'gold_month' then 'Gold Month!' when 'three_gold' then '3 Gold Months!' else 'Ultra Gold Month!' end,
    'You earned it: ' || new.description || '. Grant yourself!', '/');
  return new;
end $$;
create trigger rewards_notify after insert on public.rewards
  for each row execute function public.on_reward_earned();

-- Chat: fan out to everyone who can read the channel, except the sender
create or replace function public.on_message_posted()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_name text;
  r      record;
begin
  select case when role = 'admin' then 'Mentor' else display_name end into v_name
    from public.profiles where id = new.user_id;
  for r in
    select p.id from public.profiles p
     where p.id <> new.user_id and p.status = 'active'
       and (p.role = 'admin' or new.channel = 'global' or p.cohort_id = new.cohort_id)
  loop
    perform public.notify(r.id,
      case when new.channel = 'global' then 'global_messages' else 'cohort_messages' end,
      case when new.channel = 'global' then 'Everyone · ' else 'Cohort · ' end || v_name,
      new.message_text,
      case when new.channel = 'global' then '/chat?c=global' else '/chat' end);
  end loop;
  return new;
end $$;
create trigger messages_notify after insert on public.messages
  for each row execute function public.on_message_posted();

-- ---------------------------------------------------------------------------
-- Fix: re-saving today's check-in keeps each unchanged workout's full review
-- (previously the review timestamp was dropped, so a second re-save could
-- quietly un-reject a photo)
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke execute on function public.notify(uuid, text, text, text, text, text)     from public, anon, authenticated;
revoke execute on function public.notify_admins(text, text, text, text, text)    from public, anon, authenticated;
revoke execute on function public.wants_notification(uuid, text)                 from public, anon, authenticated;
revoke execute on function public.push_notification()                            from public, anon, authenticated;
revoke execute on function public.on_goals_submitted()                           from public, anon, authenticated;
revoke execute on function public.on_profile_activated()                         from public, anon, authenticated;
revoke execute on function public.on_workout_change()                            from public, anon, authenticated;
revoke execute on function public.on_punishment_change()                         from public, anon, authenticated;
revoke execute on function public.on_reward_earned()                             from public, anon, authenticated;
revoke execute on function public.on_message_posted()                            from public, anon, authenticated;
revoke execute on function public.mark_notifications_read(uuid[])                from public, anon;
