export type Role = 'participant' | 'admin';
export type UserStatus = 'pending_approval' | 'active' | 'removed';
export type Category = 'gym' | 'refraining' | 'custom_1' | 'custom_2' | 'custom_3';
export type GoalType = 'percentage' | 'binary' | 'inverse';
export type Theme = 'gym' | 'refraining' | 'reading' | 'nutrition' | 'schedule' | 'word' | 'content' | 'other';
export type Band = 'green' | 'gray' | 'red';
export type ProofType = 'photo' | 'video' | 'mentor_conversation';
export type ProofStatus = 'pending' | 'accepted' | 'rejected';
export type Sex = 'male' | 'female';

export interface Profile {
  id: string;
  username: string;
  display_name: string;
  role: Role;
  status: UserStatus;
  timezone: string;
  activated_at: string | null;
  created_at: string;
  /** picks the rank-title path only */
  sex: Sex | null;
  cohort_id: string | null;
  /** running total over program weeks 1–10 (max 10,490) */
  cumulative_cycle_points: number;
  rank_level: number;
  /** when the "how it works" intro was first finished/skipped */
  onboarded_at: string | null;
  /** a mentor who checks in alongside the cohort (scored, unranked) */
  mentor_participates: boolean;
  /** staff (role 'admin') with this flag are Admins; without it, Mentors */
  is_super_admin: boolean;
}

export interface ChatMessage {
  id: string;
  channel: 'cohort' | 'global' | 'dm';
  cohort_id: string | null;
  /** set for direct messages */
  recipient_id: string | null;
  user_id: string;
  message_text: string;
  created_at: string;
}

export interface Goal {
  id: string;
  user_id: string;
  category: Category;
  theme: Theme;
  goal_type: GoalType;
  label: string;
  prompt: string;
  target_value: number;
  unit: string;
  category_point_max: number;
  status: 'pending_approval' | 'approved';
  /** consequences written with the coach at signup, approved by the mentor */
  red_week_punishment: string | null;
  gold_reward: string | null;
  three_gold_reward: string | null;
  /** monthly total needed for a Gold Month; null = 80% of 4 weeks */
  gold_month_target: number | null;
}

export interface CategoryScore {
  points: number;
  actual: number;
  target: number;
  pct: number;
  max: number;
  band: Band;
  /** on-track color for the live week (null until the first day counts) */
  pace_band: Band | null;
}

export interface WeeklyScore {
  id: string;
  user_id: string;
  week_start_date: string;
  category_scores: Partial<Record<Category, CategoryScore>>;
  total_category_points: number;
  bonus_points: number;
  total_points: number;
  /** strict % of the full weekly target — drives punishments */
  band_per_category: Partial<Record<Category, Band>>;
  /** pace-adjusted — drives leaderboard dots / home colors */
  pace_band_per_category: Partial<Record<Category, Band | null>>;
  consistency_rank: number | null;
  is_top_this_week: boolean;
  finalized: boolean;
}

export interface Punishment {
  id: string;
  user_id: string;
  kind: 'red_week' | 'ultra';
  category: Category | null;
  week_start_date: string;
  punishment_description: string;
  proof_type: ProofType;
  proof_submitted_at: string | null;
  proof_file_url: string | null;
  proof_note: string | null;
  proof_status: ProofStatus;
  review_note: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface Infraction {
  id: string;
  user_id: string;
  punishment_id: string;
  infraction_number: number;
  resolution: 'warning_given' | 'removed_and_refunded' | null;
  acknowledged_at: string | null;
  created_at: string;
}

export interface NotificationSettings {
  id?: string;
  user_id: string;
  reminder_time: string;
  timezone: string;
  push_subscription: PushSubscriptionJSON | null;
  enabled: boolean;
  /** per-type notification on/off; missing keys use the default */
  prefs?: Record<string, boolean>;
}

export interface AppNotification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  url: string;
  created_at: string;
  read_at: string | null;
}

export interface ProgramState {
  status: 'unset' | 'prep' | 'active' | 'ended';
  start_date?: string;
  end_date?: string;
  program_week?: number;
  month?: number | null;
  week_of_month?: number | null;
}

export type WorkoutStatus = 'approved' | 'exception_pending' | 'exception_accepted' | 'rejected';

export interface Workout {
  id?: string;
  user_id?: string;
  entry_date?: string;
  position?: number;
  workout_type: string;
  minutes: number;
  media_path: string | null;
  exception_note: string | null;
  status?: WorkoutStatus;
  review_note?: string | null;
  created_at?: string;
}

export interface MonthWeek { label: string; band: Band | null; state: 'prep' | 'closed' | 'current' | 'future'; actual: number }

export interface MonthGoal {
  category: Category;
  label: string;
  target: number;
  gold_target: number;
  month_total: number;
  month_max: number;
  pct: number;
  greens: number;
  grays: number;
  reds: number;
  closed_weeks: number;
  weeks: MonthWeek[];
  gold_status: 'on_track' | 'lost';
  gold_reward: string | null;
}

export type MonthStatus = ProgramState & { goals: MonthGoal[] };

export interface Reward {
  id: string;
  user_id: string;
  month_number: number;
  kind: 'gold_month' | 'three_gold' | 'ultra_wish';
  category: Category | null;
  description: string;
  claimed_at: string | null;
  created_at: string;
}

export interface MonthlyResult {
  id: string;
  user_id: string;
  month_number: number;
  goals: Partial<Record<Category, { label: string; pct: number; total: number; gold_target: number; greens: number; grays: number; reds: number; gold: boolean }>>;
  avg_pct: number;
  ultra_tier: 'gold' | 'green' | 'gray' | 'red';
  created_at: string;
}

export interface TodayContext {
  date: string;
  week_start: string;
  program: ProgramState;
  workouts: Workout[];
  challenge: { id: string; description: string; point_value: number } | null;
  bonus_completed: boolean | null;
  entries: { goal_id: string; value: number; notes: string | null; details: Record<string, unknown> | null }[];
}
