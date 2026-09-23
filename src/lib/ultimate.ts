// The Ultimate Shadow: one bracket of every participant across all cohorts.
// Cohorts stay the permanent group; the bracket is an eligibility overlay.
//
//   Checkpoint win: a green week, i.e. 80%+ of the 1,049 weekly points.
//   Ranking: most checkpoint wins; total points only break a tie. A late spike
//   can't overtake someone who's been reliably green all along.
//   Cuts: at the end of weeks 2, 4, 6, 7, 8, 9 and 10 the field halves, rounding
//   up (25 → 13), and anyone exactly tied at the cut line stays. With 100
//   people: 100 → 50 → 25 → 13 → 7 → 4 → 2 → 1.
//   Mentors don't compete. Cut people keep their cohort; here they're tagged
//   "eliminated in week X".

export const WEEK_MAX = 1049;
export const GREEN_WEEK = 0.8 * WEEK_MAX;
export const CUT_WEEKS = [2, 4, 6, 7, 8, 9, 10];
export const PROGRAM_WEEKS = 10;

export interface Contender { id: string; display_name: string; cohort_id: string | null; sex: 'male' | 'female' | null; rank_level: number }
export interface ContenderWeek { user_id: string; week_start_date: string; total_points: number | string }

export interface Standing {
  person: Contender;
  wins: number;
  points: number;
  /** per program week so far: 'win' | 'miss' | 'live' (current, not over yet) */
  weeks: ('win' | 'miss' | 'live')[];
  rank: number;
  /** still in: safe above the next cut line, or below it if the cut were now */
  safe: boolean;
  eliminatedWeek: number | null;
}
export interface ScheduleWeek { week: number; cut: boolean; after: number; done: boolean }
/** One column of the bracket: who's left after a cut (projected if it hasn't happened yet) */
export interface Stage { label: string; week: number | null; people: Contender[]; done: boolean }
export interface Bracket {
  currentWeek: number;           // 0 before week 1; 11 after week 10
  inTheRunning: Standing[];      // ranked, still eligible
  eliminated: Standing[];        // latest cut first
  schedule: ScheduleWeek[];
  nextCut: number | null;        // week of the next cut
  keepAtNextCut: number | null;  // how many stay at the next cut
  winner: Standing | null;
  stages: Stage[];
}

const DAY = 86_400_000;
const addWeeks = (start: string, weeks: number) =>
  new Date(Date.parse(`${start}T00:00:00Z`) + weeks * 7 * DAY).toISOString().slice(0, 10);

export function programWeek(start: string, today: string) {
  const days = Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY);
  return days < 0 ? 0 : Math.min(PROGRAM_WEEKS + 1, Math.floor(days / 7) + 1);
}

export const keepCount = (n: number) => Math.ceil(n / 2);

export function buildBracket(people: Contender[], rows: ContenderWeek[], start: string | null, today: string): Bracket {
  const currentWeek = start ? programWeek(start, today) : 0;
  // points[user][week]
  const pts = new Map<string, number[]>();
  if (start) {
    const weekOf = new Map(Array.from({ length: PROGRAM_WEEKS }, (_, i) => [addWeeks(start, i), i + 1]));
    for (const r of rows) {
      const w = weekOf.get(r.week_start_date);
      if (!w) continue;
      const a = pts.get(r.user_id) ?? Array(PROGRAM_WEEKS + 1).fill(0);
      a[w] = Number(r.total_points);
      pts.set(r.user_id, a);
    }
  }
  const tally = (id: string, through: number) => {
    const a = pts.get(id) ?? [];
    let wins = 0, points = 0;
    for (let w = 1; w <= through; w++) {
      points += a[w] ?? 0;
      if ((a[w] ?? 0) >= GREEN_WEEK) wins += 1;
    }
    return { wins, points };
  };
  const order = (through: number) => (x: Contender, y: Contender) => {
    const a = tally(x.id, through), b = tally(y.id, through);
    return b.wins - a.wins || b.points - a.points || x.display_name.localeCompare(y.display_name);
  };
  const tied = (x: Contender, y: Contender, through: number) => {
    const a = tally(x.id, through), b = tally(y.id, through);
    return a.wins === b.wins && a.points === b.points;
  };
  // Keep the top half (rounded up) plus anyone exactly tied with the last one kept
  const cut = (field: Contender[], through: number) => {
    const ranked = [...field].sort(order(through));
    let keep = keepCount(ranked.length);
    while (keep < ranked.length && tied(ranked[keep], ranked[keep - 1], through)) keep += 1;
    return { kept: ranked.slice(0, keep), out: ranked.slice(keep) };
  };

  // Play out every cut that's already happened (its week is over)
  let field = [...people];
  const stages: Stage[] = [{ label: 'Start', week: null, people: [...people].sort(order(Math.min(currentWeek, PROGRAM_WEEKS))), done: true }];
  const outAt = new Map<string, number>();
  const schedule: ScheduleWeek[] = [];
  let projected = people.length;
  for (let w = 1; w <= PROGRAM_WEEKS; w++) {
    const isCut = CUT_WEEKS.includes(w);
    const done = currentWeek > w;
    if (isCut && done && field.length > 1) {
      const { kept, out } = cut(field, w);
      out.forEach((p) => outAt.set(p.id, w));
      field = kept;
      projected = field.length;
      stages.push({ label: `Week ${w}`, week: w, people: kept, done: true });
    } else if (isCut && !done && projected > 1) {
      projected = keepCount(projected);
    }
    schedule.push({ week: w, cut: isCut, after: isCut && done ? field.length : projected, done });
  }

  const through = Math.min(currentWeek, PROGRAM_WEEKS);
  const nextCut = CUT_WEEKS.find((w) => w >= currentWeek && currentWeek <= PROGRAM_WEEKS && field.length > 1) ?? null;
  const keepAtNextCut = nextCut ? keepCount(field.length) : null;

  const standing = (p: Contender, rank: number, safe: boolean): Standing => {
    const { wins, points } = tally(p.id, through);
    const a = pts.get(p.id) ?? [];
    const last = outAt.get(p.id) ?? through;
    const weeks = Array.from({ length: Math.min(last, through) }, (_, i) => {
      const w = i + 1;
      return w === currentWeek ? 'live' as const : (a[w] ?? 0) >= GREEN_WEEK ? 'win' as const : 'miss' as const;
    });
    return { person: p, wins, points: Math.round(points), weeks, rank, safe, eliminatedWeek: outAt.get(p.id) ?? null };
  };

  const ranked = [...field].sort(order(through));
  const inTheRunning = ranked.map((p, i) => standing(p, i + 1, keepAtNextCut == null || i < keepAtNextCut));
  const eliminated = people.filter((p) => outAt.has(p.id))
    .sort((x, y) => outAt.get(y.id)! - outAt.get(x.id)! || order(outAt.get(x.id)!)(x, y))
    .map((p) => standing(p, 0, false));
  const winner = field.length === 1 && outAt.size > 0 ? inTheRunning[0] : null;

  // Cuts still to come: project from today's ranking
  let next = ranked;
  for (const w of CUT_WEEKS) {
    if (stages.some((st) => st.week === w) || next.length <= 1) continue;
    next = next.slice(0, keepCount(next.length));
    stages.push({ label: `Week ${w}`, week: w, people: next, done: false });
  }

  return { currentWeek, inTheRunning, eliminated, schedule, nextCut, keepAtNextCut, winner, stages };
}
