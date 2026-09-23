import type { WeeklyScore } from './types';

// Same rules as the database's compute_week(): points, then more green
// categories breaks a tie. Mentors who check in are shown but never ranked.
const greens = (r: Pick<WeeklyScore, 'band_per_category'>) =>
  Object.values(r.band_per_category ?? {}).filter((b) => b === 'green').length;

/** Ranks within a set of rows (e.g. one cohort). Returns user id → rank. */
export function rankRows<T extends Pick<WeeklyScore, 'user_id' | 'total_points' | 'band_per_category'> & { mentor: boolean }>(rows: T[]) {
  const ranked = rows.filter((r) => !r.mentor)
    .sort((x, y) => Number(y.total_points) - Number(x.total_points) || greens(y) - greens(x));
  const out = new Map<string, number>();
  ranked.forEach((r, i) => {
    const prev = ranked[i - 1];
    out.set(r.user_id, prev && Number(prev.total_points) === Number(r.total_points) && greens(prev) === greens(r)
      ? out.get(prev.user_id)! : i + 1);
  });
  return out;
}
