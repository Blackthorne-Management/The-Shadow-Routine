-- ============================================================================
-- Photos, short videos and GIFs in chat (cohort, Global and DMs)
--
--   messages.media_path / media_type: an optional attachment in the private
--   "chat" bucket at chat/<sender id>/<file>. A message can be media only.
--   You can view a file only if you can see the message it's attached to
--   (the storage policy checks messages, which has its own row-level security).
-- ============================================================================
alter table public.messages
  add column media_path text,
  add column media_type text check (media_type in ('image', 'gif', 'video'));
alter table public.messages drop constraint messages_message_text_check;
alter table public.messages add constraint messages_message_text_check
  check (char_length(message_text) <= 1000
         and (char_length(trim(message_text)) >= 1 or media_path is not null));
alter table public.messages add constraint messages_media_check
  check ((media_path is null) = (media_type is null)
         and (media_path is null or split_part(media_path, '/', 1) = user_id::text));

insert into storage.buckets (id, name, public) values ('chat', 'chat', false) on conflict (id) do nothing;
-- 50 MB per file, images and video only (skipped where the columns don't exist, e.g. local tests)
do $$ begin
  update storage.buckets set file_size_limit = 52428800,
    allowed_mime_types = array['image/*', 'video/*'] where id = 'chat';
exception when undefined_column then null; end $$;

create policy chat_upload_own on storage.objects for insert to authenticated
  with check (bucket_id = 'chat' and (storage.foldername(name))[1] = auth.uid()::text);
create policy chat_read_visible on storage.objects for select to authenticated
  using (bucket_id = 'chat'
         and ((storage.foldername(name))[1] = auth.uid()::text
              or exists (select 1 from public.messages m where m.media_path = storage.objects.name)));
create policy chat_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'chat' and (storage.foldername(name))[1] = auth.uid()::text);

-- DM previews: a media-only message reads "Photo" / "Video" / "GIF"
create or replace function public.dm_preview(p_text text, p_type text)
returns text language sql immutable set search_path = '' as $$
  select coalesce(nullif(trim(p_text), ''),
                  case p_type when 'video' then 'Video' when 'gif' then 'GIF' when 'image' then 'Photo' end, '');
$$;

create or replace function public.my_dm_threads()
returns table (other_id uuid, last_text text, last_at timestamptz, last_from_me boolean, unread int)
language sql stable security definer set search_path = public as $$
  with mine as (
    select m.user_id, m.recipient_id, public.dm_preview(m.message_text, m.media_type) as message_text, m.created_at,
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
                           public.dm_preview(m.message_text, m.media_type) as message_text, m.created_at
                      from public.messages m where m.channel = 'dm') x
             order by x.a, x.b, x.created_at desc) t
     order by t.created_at desc;
end $$;

-- Chat notifications: a media-only message reads "Sent a photo" etc.
create or replace function public.on_message_posted()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_name   text;
  v_cohort text;
  v_body   text := coalesce(nullif(trim(new.message_text), ''),
                            case new.media_type when 'video' then 'Sent a video' when 'gif' then 'Sent a GIF'
                                                when 'image' then 'Sent a photo' end);
  r        record;
begin
  if new.channel = 'dm' then
    select display_name into v_name from public.profiles where id = new.user_id;
    perform public.notify(new.recipient_id, 'direct_messages', v_name, v_body, '/chat/dm/' || new.user_id);
    return new;
  end if;
  select case when role = 'admin' then (case when is_super_admin and not is_mentor then 'Admin' else 'Mentor' end) else display_name end
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
      case when new.channel = 'global' then 'Global' else coalesce(v_cohort, 'Cohort') end || ' · ' || v_name,
      v_body,
      case when new.channel = 'global' then '/chat?c=global' else '/chat' end);
  end loop;
  return new;
end $$;

revoke execute on function public.dm_preview(text, text) from public, anon;
