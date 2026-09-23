-- ============================================================================
-- Mentors/Admins who check in with the cohort also build cycle points and a
-- rank (emblem + title on their Today screen). They stay unranked on the
-- weekly leaderboard and still get no punishments or rewards.
-- ============================================================================
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
     where (pr.role = 'participant' or (pr.role = 'admin' and pr.mentor_participates))
       and (p_user is null or pr.id = p_user)
  ) t
  where p.id = t.id
    and (p.cumulative_cycle_points, p.rank_level) is distinct from (t.pts, public.rank_for(t.pts));
end $$;
revoke execute on function public.refresh_cumulative(uuid) from public, anon, authenticated;

select public.refresh_cumulative(null);
