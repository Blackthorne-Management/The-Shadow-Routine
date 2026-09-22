-- ============================================================================
-- Push reminder setup: run ONCE per project in the SQL editor, after the
-- migrations and after deploying the send-reminders Edge Function
-- (deploy it with JWT verification OFF; it checks x-cron-secret itself).
--
-- 1. Generate a VAPID pair locally:  npm run vapid
-- 2. Make up a long random cron secret (e.g. openssl rand -base64 32)
-- 3. Fill in the placeholders below and run this file.
-- 4. Put the PUBLIC key in VITE_VAPID_PUBLIC_KEY (.env and Netlify).
--
-- The secrets live encrypted in Vault; the Edge Function reads them through
-- public.push_config() (service role only) and pg_cron reads them here.
-- ============================================================================
create extension if not exists pg_net with schema extensions;

select vault.create_secret('https://YOUR-PROJECT-REF.supabase.co', 'project_url');
select vault.create_secret('REPLACE-WITH-VAPID-PUBLIC-KEY',        'vapid_public_key');
select vault.create_secret('REPLACE-WITH-VAPID-PRIVATE-KEY',       'vapid_private_key');
select vault.create_secret('mailto:you@example.com',               'vapid_subject');
select vault.create_secret('REPLACE-WITH-A-LONG-RANDOM-SECRET',    'cron_secret');

select cron.schedule('send-reminders', '*/5 * * * *', $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
               || '/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
$$);

-- To stop:  select cron.unschedule('send-reminders');
-- To check: select * from cron.job_run_details order by start_time desc limit 20;
--           select status_code, content from net._http_response order by created desc limit 5;
