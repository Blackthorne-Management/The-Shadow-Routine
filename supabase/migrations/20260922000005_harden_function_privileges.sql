-- ============================================================================
-- Function privilege hardening (from the Supabase security advisor).
--
-- Supabase grants EXECUTE on new public functions to anon + authenticated by
-- default. Signed-out visitors only need check_signup (the join screen);
-- everything else requires a signed-in user and checks the caller itself.
-- ============================================================================

revoke execute on all functions in schema public from anon, public;
grant execute on function public.check_signup(text, text) to anon;

-- Internal helpers that signed-in clients never call directly
revoke execute on function public.local_today(uuid)        from authenticated;
revoke execute on function public.guard_profile_update()   from authenticated;
revoke execute on function public.handle_new_user()        from authenticated;
revoke execute on function public.finalize_previous_week() from authenticated;

-- Future functions in this schema start private too
alter default privileges in schema public revoke execute on functions from anon, public;

-- Pin search_path on the small pure helpers (everything they use is qualified)
alter function public.week_start(date)                                         set search_path = '';
alter function public.category_point_max(public.goal_category)                 set search_path = '';
alter function public.valid_timezone(text)                                     set search_path = '';
alter function public.band_for(numeric)                                        set search_path = '';
alter function public.pace_band(numeric, numeric, public.goal_type, int)       set search_path = '';
