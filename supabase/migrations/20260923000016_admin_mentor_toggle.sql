-- ============================================================================
-- An Admin can also be a mentor, or not.
--
--   profiles.is_mentor: staff who do the day-to-day mentoring. Mentors always
--   are; an Admin can switch it off (set_is_mentor) and keep every Admin power.
--   Mentor alerts (goal submissions, no-photo workouts, proof to review) go
--   only to mentors; if no active mentor exists, they fall back to all staff
--   so nothing is missed.
-- ============================================================================
alter table public.profiles add column is_mentor boolean not null default true;
grant select (is_mentor) on public.profiles to authenticated;

create or replace function public.set_is_mentor(p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'ADMIN_ONLY'; end if;
  update public.profiles set is_mentor = p_on where id = auth.uid();
end $$;

-- Mentors can't switch themselves off: only Admins have a choice
create or replace function public.profiles_mentor_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.role = 'admin' and not new.is_super_admin then new.is_mentor := true; end if;
  return new;
end $$;
create trigger profiles_mentor_guard before insert or update of is_mentor, is_super_admin, role on public.profiles
  for each row execute function public.profiles_mentor_guard();

create or replace function public.notify_admins(p_type text, p_title text, p_body text, p_url text,
                                                p_dedupe text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  a record;
  v_any_mentor boolean := exists (select 1 from public.profiles
                                   where role = 'admin' and status = 'active' and is_mentor);
begin
  for a in select id from public.profiles
            where role = 'admin' and status = 'active' and (is_mentor or not v_any_mentor) loop
    perform public.notify(a.id, p_type, p_title, p_body, p_url, p_dedupe);
  end loop;
end $$;

revoke execute on function public.set_is_mentor(boolean)                        from public, anon;
revoke execute on function public.profiles_mentor_guard()                       from public, anon, authenticated;
revoke execute on function public.notify_admins(text, text, text, text, text)   from public, anon, authenticated;
