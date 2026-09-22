-- ============================================================================
-- Creating the first admin (the founder). Two steps:
--
-- 1. Run this to mint a one-time invite code, then sign up in the app at
--    /join with it like any participant would:
insert into public.invite_codes (code, note) values ('FOUNDER-START', 'Founder bootstrap');

-- 2. After signing up, promote yourself (replace the username):
--
--    update public.profiles
--       set role = 'admin', status = 'active', activated_at = now()
--     where username = 'your_username';
--
-- (Run step 2 from the SQL editor — it runs as the postgres role, which the
-- profile guard trigger allows.)
-- ============================================================================
