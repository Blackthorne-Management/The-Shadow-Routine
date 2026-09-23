-- ============================================================================
-- Security hardening (code side)
--
--   * Invite codes: SHDW-XXXXX-XXXXX (10 hex chars ≈ 1 trillion combinations,
--     was 6 ≈ 16 million), so they can't practically be guessed through the
--     public sign-up check. Existing unused codes keep working.
--   * Proof uploads: 50 MB max, images and video only (chat already has this).
-- ============================================================================
alter table public.invite_codes alter column code set default
  ('SHDW-' || upper(substr(md5(gen_random_uuid()::text), 1, 5)) || '-' || upper(substr(md5(gen_random_uuid()::text), 1, 5)));

do $$ begin
  update storage.buckets set file_size_limit = 52428800, allowed_mime_types = array['image/*', 'video/*']
   where id = 'proofs';
exception when undefined_column then null; end $$;
