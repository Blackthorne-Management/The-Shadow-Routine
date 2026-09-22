-- ============================================================================
-- "How it works" intro: shown once per account (remembered server-side so a
-- new phone doesn't show it again). Reopenable any time from Me.
-- ============================================================================
alter table public.profiles add column onboarded_at timestamptz;
grant select (onboarded_at) on public.profiles to authenticated;

create or replace function public.mark_onboarded()
returns void language sql security definer set search_path = public as $$
  update public.profiles set onboarded_at = coalesce(onboarded_at, now()) where id = auth.uid();
$$;
revoke execute on function public.mark_onboarded() from public, anon;
