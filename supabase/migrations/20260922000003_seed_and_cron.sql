-- ============================================================================
-- Default content + scheduled jobs
-- ============================================================================

-- PLACEHOLDER punishment library. The founder will supply the real list —
-- edit these in the admin dashboard (Admin → Library) rather than here.
insert into public.punishment_library (theme, description, proof_type) values
  ('gym',        '[Placeholder] 100 extra burpees in one session',                      'video'),
  ('refraining', '[Placeholder] Write a one-page reflection on what triggered the slip', 'photo'),
  ('reading',    '[Placeholder] Read an extra 50 pages and summarize them',             'photo'),
  ('nutrition',  '[Placeholder] Meal-prep every meal for 3 days and photograph it',     'photo'),
  ('schedule',   '[Placeholder] Smash a watch you like',                                'video'),
  ('word',       '[Placeholder] A full day of silence',                                 'mentor_conversation'),
  ('content',    '[Placeholder] Post 3 extra pieces of content this week',              'photo'),
  ('other',      '[Placeholder] Mentor assigns a punishment in conversation',           'mentor_conversation');

insert into public.bonus_presets (description, sort_order) values
  ('Do 10 pushups',                              1),
  ('Take a 10-minute walk without your phone',   2),
  ('Drink 8 glasses of water',                   3),
  ('Write down 3 things you''re grateful for',   4),
  ('Take a cold shower (2+ minutes)',            5),
  ('Reach out to someone you haven''t talked to in a while', 6),
  ('No social media until noon',                 7),
  ('Hold a 2-minute plank',                      8),
  ('Make your bed before 8 AM',                  9),
  ('Spend 10 minutes planning tomorrow',        10);

-- ---------------------------------------------------------------------------
-- pg_cron jobs that need no secrets. (The push-reminder job calls an Edge
-- Function and needs your project URL + a secret — see supabase/sql/schedule_reminders.sql.)
-- ---------------------------------------------------------------------------
create extension if not exists pg_cron;

-- Monday 12:00 UTC: finalize last week (bands → punishments). Noon UTC is
-- after Sunday midnight in every US timezone.
select cron.schedule('finalize-week', '0 12 * * 1', $$select public.finalize_previous_week()$$);

-- Daily: pre-create bonus challenges a couple of days out so every timezone
-- (and the admin's Bonus tab) sees the upcoming ones.
select cron.schedule('bonus-rotation', '5 0 * * *', $$
  select public.ensure_bonus_challenge(((now() at time zone 'UTC')::date) + d)
  from generate_series(-1, 2) d
$$);
