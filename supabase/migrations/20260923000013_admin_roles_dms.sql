-- ============================================================================
-- Admins vs mentors, direct messages, and the mentor to-do counts
--
--   profiles.role = 'admin' is staff. Staff with is_super_admin are Admins;
--   staff without it are Mentors. Mentors keep everything they do day to day
--   (approvals, workout + proof review, bonus, fallbacks, participant invites).
--   Admin only: reading other people's direct messages, program dates and
--   month close-outs, closing weeks, removing participants, mentor invites.
--
--   Direct messages are rows in public.messages with channel = 'dm' and a
--   recipient. The two people in a conversation read it; Admins can read all;
--   Mentors can't read anyone else's.
-- ============================================================================

alter table public.profiles add column is_super_admin boolean not null default false;
grant select (is_super_admin) on public.profiles to authenticated;

-- The existing staff account(s) are the founders: they become Admins.
-- Anyone who joins with a mentor link from here on is a Mentor.
update public.profiles set is_super_admin = true where role = 'admin';

create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles
                  where id = auth.uid() and role = 'admin' and is_super_admin and status = 'active');
$$;

-- ---------------------------------------------------------------------------
-- Admin-only actions: same functions, with the Admin check in place of staff
-- ---------------------------------------------------------------------------
do $$
declare
  f   text;
  def text;
begin
  foreach f in array array['public.remove_participant(uuid)', 'public.admin_finalize_week(date)',
                           'public.admin_finalize_month(int)', 'public.admin_set_program_start(date)'] loop
    def := pg_get_functiondef(f::regprocedure);
    if position('public.is_admin()' in def) = 0 then raise exception 'no staff check in %', f; end if;
    execute replace(def, 'public.is_admin()', 'public.is_super_admin()');
  end loop;
end $$;

-- Mentors can make participant invites; only Admins make mentor invites
drop policy invites_admin on public.invite_codes;
create policy invites_read on public.invite_codes for select to authenticated
  using (public.is_admin());
create policy invites_insert on public.invite_codes for insert to authenticated
  with check (public.is_admin() and (role = 'participant' or public.is_super_admin()));
create policy invites_update on public.invite_codes for update to authenticated
  using (public.is_admin() and (role = 'participant' or public.is_super_admin()))
  with check (public.is_admin() and (role = 'participant' or public.is_super_admin()));
create policy invites_delete on public.invite_codes for delete to authenticated
  using (public.is_admin() and (role = 'participant' or public.is_super_admin()));

-- ---------------------------------------------------------------------------
-- Direct messages
-- ---------------------------------------------------------------------------
alter table public.messages add column recipient_id uuid references public.profiles (id) on delete cascade;
alter table public.messages drop constraint messages_channel_check;
alter table public.messages add constraint messages_channel_check check (channel in ('cohort', 'global', 'dm'));
alter table public.messages drop constraint messages_channel_cohort;
alter table public.messages add constraint messages_channel_cohort check ((channel = 'cohort') = (cohort_id is not null));
alter table public.messages add constraint messages_channel_dm
  check ((channel = 'dm') = (recipient_id is not null) and recipient_id is distinct from user_id);
create index messages_dm_pair_idx on public.messages
  (least(user_id, recipient_id), greatest(user_id, recipient_id), created_at desc) where channel = 'dm';
create index messages_dm_recipient_idx on public.messages (recipient_id, created_at desc) where channel = 'dm';

-- Both active; same cohort, or one of them is staff
create or replace function public.can_dm(p_other uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles me, public.profiles o
     where me.id = auth.uid() and o.id = p_other and me.id <> o.id
       and me.status = 'active' and o.status = 'active'
       and (me.role = 'admin' or o.role = 'admin' or me.cohort_id = o.cohort_id));
$$;

drop policy messages_read on public.messages;
drop policy messages_post on public.messages;
drop policy messages_delete on public.messages;
create policy messages_read on public.messages for select to authenticated
  using (case channel
           when 'dm'     then user_id = auth.uid() or recipient_id = auth.uid() or public.is_super_admin()
           when 'cohort' then public.is_admin() or cohort_id = public.my_chat_cohort()
           else               public.is_admin() or public.my_chat_cohort() is not null
         end);
create policy messages_post on public.messages for insert to authenticated
  with check (user_id = auth.uid() and (
    (channel = 'cohort' and (cohort_id = public.my_chat_cohort() or public.is_admin()))
    or (channel = 'global' and cohort_id is null and (public.my_chat_cohort() is not null or public.is_admin()))
    or (channel = 'dm' and cohort_id is null and public.can_dm(recipient_id))));
-- Group chats: staff moderate. DMs: you can delete what you sent; Admins can delete any.
create policy messages_delete on public.messages for delete to authenticated
  using (case channel
           when 'dm' then user_id = auth.uid() or public.is_super_admin()
           else public.is_admin()
         end);

-- Where each person has read up to, per conversation
create table public.dm_reads (
  user_id      uuid not null references public.profiles (id) on delete cascade,
  other_id     uuid not null references public.profiles (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (user_id, other_id)
);
alter table public.dm_reads enable row level security;
create policy dm_reads_own on public.dm_reads for select to authenticated using (user_id = auth.uid());

create or replace function public.mark_dm_read(p_other uuid)
returns void language sql security definer set search_path = public as $$
  insert into public.dm_reads (user_id, other_id, last_read_at) values (auth.uid(), p_other, now())
  on conflict (user_id, other_id) do update set last_read_at = excluded.last_read_at;
$$;

-- Your conversations, newest first, with unread counts
create or replace function public.my_dm_threads()
returns table (other_id uuid, last_text text, last_at timestamptz, last_from_me boolean, unread int)
language sql stable security definer set search_path = public as $$
  with mine as (
    select m.user_id, m.recipient_id, m.message_text, m.created_at,
           case when m.user_id = auth.uid() then m.recipient_id else m.user_id end as other
      from public.messages m
     where m.channel = 'dm' and (m.user_id = auth.uid() or m.recipient_id = auth.uid())
  ), last as (
    select distinct on (other) other, message_text, created_at, user_id = auth.uid() as from_me
      from mine order by other, created_at desc
  )
  select l.other, l.message_text, l.created_at, l.from_me,
         (select count(*)::int from mine x
           where x.other = l.other and x.recipient_id = auth.uid()
             and x.created_at > coalesce((select r.last_read_at from public.dm_reads r
                                           where r.user_id = auth.uid() and r.other_id = l.other), '-infinity'))
    from last l
   order by l.created_at desc;
$$;

-- Admin: every conversation between two people
create or replace function public.admin_dm_threads()
returns table (a uuid, b uuid, last_text text, last_at timestamptz, messages int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'ADMIN_ONLY'; end if;
  return query
    select t.a, t.b, t.message_text, t.created_at, t.n
      from (select distinct on (x.a, x.b) x.a, x.b, x.message_text, x.created_at,
                   (count(*) over (partition by x.a, x.b))::int as n
              from (select least(m.user_id, m.recipient_id) as a, greatest(m.user_id, m.recipient_id) as b,
                           m.message_text, m.created_at
                      from public.messages m where m.channel = 'dm') x
             order by x.a, x.b, x.created_at desc) t
     order by t.created_at desc;
end $$;

-- Chat notifications: DMs go to the recipient only
create or replace function public.on_message_posted()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_name text;
  r      record;
begin
  if new.channel = 'dm' then
    select display_name into v_name from public.profiles where id = new.user_id;
    perform public.notify(new.recipient_id, 'direct_messages', v_name, new.message_text, '/chat/dm/' || new.user_id);
    return new;
  end if;
  select case when role = 'admin' then (case when is_super_admin then 'Admin' else 'Mentor' end) else display_name end
    into v_name from public.profiles where id = new.user_id;
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

-- ---------------------------------------------------------------------------
-- What's waiting for staff, per admin section (drives the badges)
-- ---------------------------------------------------------------------------
create or replace function public.admin_pending_counts()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  return jsonb_build_object(
    'approvals', (select count(*) from public.profiles p
                   where p.role = 'participant' and p.status = 'pending_approval'
                     and exists (select 1 from public.consequences c where c.user_id = p.id)),
    'workouts',  (select count(*) from public.workouts where status = 'exception_pending'),
    'proofs',    (select count(*) from public.punishments
                   where proof_status = 'pending' and proof_submitted_at is not null));
end $$;

revoke execute on function public.is_super_admin()        from public, anon;
revoke execute on function public.can_dm(uuid)            from public, anon;
revoke execute on function public.mark_dm_read(uuid)      from public, anon;
revoke execute on function public.my_dm_threads()         from public, anon;
revoke execute on function public.admin_dm_threads()      from public, anon;
revoke execute on function public.admin_pending_counts()  from public, anon;
