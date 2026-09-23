-- ============================================================================
-- Cohorts carry Japanese spiritual names. The first cohort becomes Marishiten
-- (goddess of light and mirage, patron of warriors, said to move unseen).
-- Cohort chat notifications use the cohort's name: "Marishiten · Alex".
-- ============================================================================
update public.cohorts set name = 'Marishiten' where name = 'Cohort 1';

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
       and (p.role = 'admin' or new.channel = 'global' or p.cohort_id = new.cohort_id)
  loop
    perform public.notify(r.id,
      case when new.channel = 'global' then 'global_messages' else 'cohort_messages' end,
      case when new.channel = 'global' then 'Everyone' else coalesce(v_cohort, 'Cohort') end || ' · ' || v_name,
      new.message_text,
      case when new.channel = 'global' then '/chat?c=global' else '/chat' end);
  end loop;
  return new;
end $$;
