-- ============================================================================
-- Run ONCE in the Supabase SQL editor after deploying the send-reminders
-- Edge Function. Replace the two placeholder values first.
--
-- Every 5 minutes pg_cron → pg_net calls the function, which pushes a
-- reminder to anyone whose local reminder time has arrived.
-- ============================================================================
create extension if not exists pg_net;

select vault.create_secret('https://YOUR-PROJECT-REF.supabase.co', 'project_url');
select vault.create_secret('REPLACE-WITH-THE-SAME-CRON_SECRET-YOU-SET-ON-THE-FUNCTION', 'cron_secret');

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
