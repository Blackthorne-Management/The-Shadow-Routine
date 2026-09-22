import type { Category, Goal, GoalType, Theme } from './types';

export const CATEGORY_ORDER: Category[] = ['gym', 'refraining', 'custom_1', 'custom_2', 'custom_3'];

export const CATEGORY_POINTS: Record<Category, number> = {
  gym: 300, refraining: 200, custom_1: 200, custom_2: 150, custom_3: 150,
};

export const CATEGORY_NAMES: Record<Category, string> = {
  gym: 'Gym', refraining: 'Refraining', custom_1: 'Custom 1', custom_2: 'Custom 2', custom_3: 'Custom 3',
};

export const THEME_NAMES: Record<Theme, string> = {
  gym: 'Fitness', refraining: 'Refraining', reading: 'Reading', nutrition: 'Eating / Nutrition',
  schedule: 'Schedule / Time', word: 'Word / Promises', content: 'Content Posting', other: 'Fully custom',
};

/** Suggested starting points for the three custom slots. */
export const CUSTOM_SUGGESTIONS: {
  theme: Theme; goal_type: GoalType; label: string; target_value: number; unit: string;
}[] = [
  { theme: 'reading',   goal_type: 'percentage', label: 'Read 200 pages',              target_value: 200, unit: 'pages' },
  { theme: 'nutrition', goal_type: 'binary',     label: 'Stick to my eating plan',     target_value: 6,   unit: 'days' },
  { theme: 'schedule',  goal_type: 'binary',     label: 'Follow my daily schedule',    target_value: 6,   unit: 'days' },
  { theme: 'word',      goal_type: 'binary',     label: 'Keep every promise I make',   target_value: 7,   unit: 'days' },
  { theme: 'content',   goal_type: 'binary',     label: 'Post content 5x a week',      target_value: 5,   unit: 'days' },
  { theme: 'other',     goal_type: 'binary',     label: '',                            target_value: 5,   unit: 'days' },
];

/**
 * Default wording for the daily check-in question. Participants see it while
 * proposing and the admin can rewrite it at approval — it's stored per goal.
 */
export function defaultPrompt(g: { category: Category; theme: Theme; goal_type: GoalType; label: string; unit: string }): string {
  if (g.category === 'gym') return 'Did you complete a workout today (30+ minutes)?';
  if (g.category === 'refraining') {
    const vice = g.label.trim().replace(/^(no|avoid|quit|stop|zero)\s+/i, '').toLowerCase();
    return vice ? `Did you avoid ${vice} today?` : 'Did you stay clean today?';
  }
  if (g.goal_type === 'percentage') {
    if (g.theme === 'reading') return `How many ${g.unit || 'pages'} did you read today?`;
    return `How many ${g.unit || 'units'} today? (${g.label})`;
  }
  switch (g.theme) {
    case 'nutrition': return 'Did you stick to your eating plan today?';
    case 'schedule':  return 'Did you follow your schedule today?';
    case 'word':      return 'Did you keep your word today?';
    case 'content':   return 'Did you post today?';
    default:          return g.label ? `Did you hit "${g.label}" today?` : 'Did you hit your goal today?';
  }
}

/** "4 workouts / week", "200 pages / week", "7 clean days / week" */
export function describeTarget(g: Pick<Goal, 'goal_type' | 'target_value' | 'unit'>): string {
  const n = Number(g.target_value);
  if (g.goal_type === 'inverse') return `${n} clean day${n === 1 ? '' : 's'} / week`;
  return `${n} ${g.unit} / week`;
}

export const sortGoals = <T extends { category: Category }>(goals: T[]) =>
  [...goals].sort((a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category));
