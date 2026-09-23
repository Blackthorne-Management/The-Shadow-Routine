-- ============================================================================
-- Cohort emblems for The Ultimate Shadow bracket (art to come). Until a cohort
-- has one, the app draws a placeholder seal with the cohort's initial.
-- ============================================================================
alter table public.cohorts add column emblem_url text;
