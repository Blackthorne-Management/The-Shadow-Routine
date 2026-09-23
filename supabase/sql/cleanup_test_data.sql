-- ============================================================================
-- Pre-launch cleanup: remove test accounts and test cohorts, optionally reset
-- everyone's program activity for a clean start.
--
-- SAFE BY DEFAULT: everything runs inside a transaction that ends in ROLLBACK,
-- so running it as-is only PREVIEWS what would be removed. To really do it,
-- change the last line from `rollback;` to `commit;`.
--
-- Run in: Supabase dashboard → SQL Editor (as the postgres role).
-- Take a backup first (Database → Backups on Pro, or `supabase db dump`).
-- ============================================================================
begin;

-- 1. Who counts as a test account. Edit this list before running.
--    Real people (e.g. Lodie, Pearson, Rio) are NOT included. Add a username
--    here only if you want that account gone.
create temp table cleanup_users on commit drop as
select p.id, p.username, p.display_name
  from public.profiles p
 where p.username in (
         'test_alex', 'test_blake', 'testyboy',
         'test_aiko', 'test_sora', 'test_haru', 'test_kenji',
         'test_mika', 'test_taro', 'test_yumi', 'test_ren'
       );

-- 2. Test cohorts (the bracket test cohorts). Marishiten and Fudō are kept.
create temp table cleanup_cohorts on commit drop as
select c.id, c.name from public.cohorts c
 where c.name in ('Hachiman', 'Bishamonten', 'Raijin', 'Fūjin', 'Susanoo',
                  'Tsukuyomi', 'Amaterasu', 'Takemikazuchi');

-- Preview
select 'account to delete' as what, username || ' (' || display_name || ')' as detail from cleanup_users
union all
select 'cohort to delete', name from cleanup_cohorts
union all
select 'real account KEPT', username || ' (' || display_name || ')'
  from public.profiles where id not in (select id from cleanup_users);

-- Nobody real may still be in a cohort we're deleting
do $$ begin
  if exists (select 1 from public.profiles p
              where p.cohort_id in (select id from cleanup_cohorts)
                and p.id not in (select id from cleanup_users)) then
    raise exception 'A real account is still in a cohort marked for deletion: move them first (Admin → People)';
  end if;
end $$;

-- 3. Delete. Removing the auth user cascades to their profile, goals,
--    check-ins, scores, workouts, punishments, messages, notifications, etc.
delete from auth.users where id in (select id from cleanup_users);
delete from public.invite_codes where cohort_id in (select id from cleanup_cohorts);
delete from public.cohorts where id in (select id from cleanup_cohorts);

-- 4. OPTIONAL clean slate for everyone who's left: uncomment to wipe all
--    program activity (check-ins, scores, workouts, punishments, rewards,
--    challenges, chat, notifications) while keeping accounts, goals and cohorts.
-- delete from public.daily_entries;
-- delete from public.workouts;
-- delete from public.weekly_scores;
-- delete from public.monthly_results;
-- delete from public.punishments;
-- delete from public.infractions;
-- delete from public.rewards;
-- delete from public.bonus_completions;
-- delete from public.bonus_challenges;
-- delete from public.messages;
-- delete from public.dm_reads;
-- delete from public.notifications;
-- delete from public.score_refresh;
-- update public.profiles set cumulative_cycle_points = 0, rank_level = 1;

-- 5. Then set the real program start date in Admin → Program.

-- After: what's left
select 'remaining accounts' as what, count(*)::text as n from public.profiles
union all select 'remaining cohorts', count(*)::text from public.cohorts;

rollback;   -- ← change to `commit;` to apply
