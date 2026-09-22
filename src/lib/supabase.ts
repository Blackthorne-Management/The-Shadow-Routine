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
    NEED_CONSEQUENCES: 'Every goal needs its red-week punishment and both rewards, plus your Ultra Punishment and one wish.',
    BAD_WORKOUT_TARGET: 'Workouts per week must be between 1 and 21.',
    WORKOUT_TOO_SHORT: 'A workout needs to be 30 minutes or more.',
    WORKOUT_NEEDS_PHOTO: 'Each workout needs a photo or clip — or a note asking your mentor for an exception.',
    TOO_MANY_WORKOUTS: 'That is more workouts than one day allows (max 6).',
    PROGRAM_NOT_STARTED: "The program hasn't started yet — check-ins open on program week 1.",
    PROGRAM_ENDED: 'The program has ended. Your history is read-only now.',
    MUST_BE_MONDAY: 'Program week 1 has to start on a Monday.',
    MONTH_NOT_OVER: "That month isn't over yet.",
    PROGRAM_NOT_SET: 'Set the program start date first.',
    'Invalid login credentials': 'Wrong email or password.',
  };
  for (const [code, text] of Object.entries(map)) if (msg.includes(code)) return text;
  if (msg.includes('Database error saving new user')) return 'Signup failed — check your invite code and username.';
  return msg;
}
