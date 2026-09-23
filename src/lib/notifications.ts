// Notification types a person can turn on/off in Me → Notifications.
// Must match the types used by public.notify() in the database; a missing
// preference falls back to `defaultOn` (same default as public.notification_default).

export interface PrefDef { key: string; label: string; hint: string; defaultOn: boolean }

export const PARTICIPANT_PREFS: PrefDef[] = [
  { key: 'daily_reminder', label: 'Nightly check-in reminder', hint: 'At the reminder time you pick', defaultOn: true },
  { key: 'approvals', label: 'Goal approval', hint: 'When your mentor approves your goals', defaultOn: true },
  { key: 'workout_reviews', label: 'Workout reviews', hint: 'A photo rejected, or a no-photo workout accepted/rejected', defaultOn: true },
  { key: 'punishments', label: 'Punishments', hint: 'A red week or an Ultra Punishment is issued', defaultOn: true },
  { key: 'proof_reviews', label: 'Proof reviews', hint: 'Your punishment proof is accepted or rejected', defaultOn: true },
  { key: 'rewards', label: 'Rewards', hint: 'Gold Months and other rewards you earn', defaultOn: true },
  { key: 'direct_messages', label: 'Direct messages', hint: 'Someone messages you directly', defaultOn: true },
  { key: 'cohort_messages', label: 'Cohort chat', hint: 'New messages in your cohort', defaultOn: true },
  { key: 'global_messages', label: 'Global chat', hint: 'New messages from everyone, across cohorts', defaultOn: false },
];

export const ADMIN_PREFS: PrefDef[] = [
  { key: 'admin_goal_submissions', label: 'Goal submissions', hint: 'Someone submits goals for approval', defaultOn: true },
  { key: 'admin_exceptions', label: 'No-photo workouts', hint: 'Someone asks for a workout exception', defaultOn: true },
  { key: 'admin_proofs', label: 'Punishment proof', hint: 'Someone submits proof to review', defaultOn: true },
  { key: 'direct_messages', label: 'Direct messages', hint: 'Someone messages you directly', defaultOn: true },
  { key: 'cohort_messages', label: 'Cohort chat', hint: 'New messages in any cohort', defaultOn: true },
  { key: 'global_messages', label: 'Global chat', hint: 'New messages in the channel for all cohorts', defaultOn: false },
];

export const prefOn = (prefs: Record<string, boolean> | null | undefined, d: PrefDef) => prefs?.[d.key] ?? d.defaultOn;
