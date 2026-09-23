-- ============================================================================
-- DMs across cohorts, and one label rule for staff
--
--   can_dm: any two active members, in any cohort.
--   Staff show as "Mentor" unless they're an Admin who mentors no cohort
--   (then "Admin"). Chat notifications follow the same rule.
-- ============================================================================
create or replace function public.can_dm(p_other uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles me, public.profiles o
     where me.id = auth.uid() and o.id = p_other and me.id <> o.id
       and me.status = 'active' and o.status = 'active');
$$;

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
      new.message_text,
      case when new.channel = 'global' then '/chat?c=global' else '/chat' end);
  end loop;
  return new;
end $$;
