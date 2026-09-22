import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isConfigured = Boolean(url && key);

export const supabase = createClient(url ?? 'http://localhost', key ?? 'missing', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

// Columns participants may read on profiles (email is hidden by column grants,
// so `select('*')` would fail — always use this list).
export const PROFILE_COLUMNS = 'id,username,display_name,role,status,timezone,activated_at,created_at';

/** Turns Postgres RAISE codes from our SQL functions into readable messages. */
export function friendlyError(err: unknown): string {
  const msg = (err as { message?: string })?.message ?? String(err);
  const map: Record<string, string> = {
    INVALID_INVITE_CODE: 'That invite code is invalid or already used.',
    GOALS_LOCKED: 'Your goals are locked once approved. Ask your mentor to adjust them.',
    NEED_FIVE_GOALS: 'All five goals are required.',
    BAD_CUSTOM_GOAL: 'Custom goals must be a quantity or yes/no goal.',
    TARGET_OVER_7_DAYS: 'Yes/no goals can target at most 7 days a week.',
    NOT_ACTIVE: 'Your account is not active yet.',
    BAD_GOAL: 'One of those goals is not yours or not approved.',
    ADMIN_ONLY: 'Admins only.',
    FILE_REQUIRED: 'This punishment needs a photo or video.',
    ALREADY_ACCEPTED: 'That proof was already accepted.',
    NOT_ALLOWED: 'Not allowed.',
    'Invalid login credentials': 'Wrong email or password.',
  };
  for (const [code, text] of Object.entries(map)) if (msg.includes(code)) return text;
  if (msg.includes('Database error saving new user')) return 'Signup failed — check your invite code and username.';
  return msg;
}
