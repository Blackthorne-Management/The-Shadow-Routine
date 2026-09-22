export type Role = 'participant' | 'admin';
export type UserStatus = 'pending_approval' | 'active' | 'removed';
export type Category = 'gym' | 'refraining' | 'custom_1' | 'custom_2' | 'custom_3';
export type GoalType = 'percentage' | 'binary' | 'inverse';
export type Theme = 'gym' | 'refraining' | 'reading' | 'nutrition' | 'schedule' | 'word' | 'content' | 'other';
export type Band = 'green' | 'gray' | 'red';
export type ProofType = 'photo' | 'video' | 'mentor_conversation';
export type ProofStatus = 'pending' | 'accepted' | 'rejected';

export interface Profile {
  id: string;
  username: string;
  display_name: string;
  role: Role;
  status: UserStatus;
  timezone: string;
  activated_at: string | null;
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
  category: Category;
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
}

export interface TodayContext {
  date: string;
  week_start: string;
  challenge: { id: string; description: string; point_value: number } | null;
  bonus_completed: boolean | null;
  entries: { goal_id: string; value: number; notes: string | null; details: Record<string, unknown> | null }[];
}
