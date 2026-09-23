-- ============================================================================
-- A sixth, optional goal slot for tracking only (no points). Added on its own
-- because a new enum value can't be used in the same transaction.
-- ============================================================================
alter type public.goal_category add value if not exists 'custom_4';
