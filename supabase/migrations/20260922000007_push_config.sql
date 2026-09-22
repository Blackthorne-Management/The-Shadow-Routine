-- ============================================================================
-- Push reminder configuration, read from Supabase Vault.
--
-- The send-reminders Edge Function needs the VAPID key pair and the shared
-- cron secret. Rather than Edge Function secrets (dashboard/CLI only), they
-- live encrypted in Vault and are handed out by this function, which only the
-- service role (the Edge Function's own key) may call.
--
-- Vault entries (created once per project, never committed):
--   vapid_public_key, vapid_private_key, vapid_subject, cron_secret, project_url
-- ============================================================================

create or replace function public.push_config()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  return (
    select coalesce(jsonb_object_agg(name, decrypted_secret), '{}'::jsonb)
      from vault.decrypted_secrets
     where name in ('vapid_public_key', 'vapid_private_key', 'vapid_subject', 'cron_secret')
  );
end $$;

revoke execute on function public.push_config() from public, anon, authenticated;
grant execute on function public.push_config() to service_role;
