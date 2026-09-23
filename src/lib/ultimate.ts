// The Ultimate Shadow: cohorts compete in a bracket across the 10 program weeks.
//
//   Cohort score = average weekly points per participant (mentors excluded),
//   so a cohort's size doesn't matter. Ties: more green categories per
//   participant-week, then name.
//
//   Round 1 (weeks 1–2)      all cohorts, top 8 move on
//   Quarterfinals (3–4)      1v8, 2v7, 3v6, 4v5 (seeded by Round 1)
//   Semifinals (5–6)         winner 1v8 vs winner 4v5, winner 2v7 vs winner 3v6
//   The Final (7–10)         the last two; the winner is The Ultimate Shadow
//
// A round's slots fill in once the round before it is over. While a round is
// live, whoever's ahead is marked "moving on if it ended now".

export interface BracketCohort { id: string; name: string; emblem_url: string | null; created_at: string }
export interface BracketWeek { user_id: string; week_start_date: string; total_points: number | string; band_per_category: Record<string, string | null> | null }
export interface BracketMember { id: string; cohort_id: string | null; role: string; status: string }

export type RoundStatus = 'upcoming' | 'live' | 'done';
export interface Score { score: number | null; greens: number }
export interface Standing extends Score { cohort: BracketCohort; rank: number; advancing: boolean }
export interface Match {
  a: BracketCohort | null; b: BracketCohort | null;
  aScore: Score | null; bScore: Score | null;
  /** decided winner (round done), or the leader while live */
  leader: string | null;
}
export interface Round { key: 'r1' | 'qf' | 'sf' | 'final'; name: string; weeks: [number, number]; status: RoundStatus }
export interface Bracket {
  currentWeek: number;              // program week (0 = before week 1, 11 = after week 10)
  rounds: Round[];
  r1: Standing[];
  qf: Match[]; sf: Match[]; final: Match;
  champion: BracketCohort | null;
}

export const ROUNDS: Omit<Round, 'status'>[] = [
  { key: 'r1', name: 'Round 1', weeks: [1, 2] },
  { key: 'qf', name: 'Quarterfinals', weeks: [3, 4] },
  { key: 'sf', name: 'Semifinals', weeks: [5, 6] },
  { key: 'final', name: 'The Final', weeks: [7, 10] },
];
export const ADVANCE_FROM_R1 = 8;

const DAY = 86_400_000;
const addWeeks = (start: string, weeks: number) =>
  new Date(Date.parse(`${start}T00:00:00Z`) + weeks * 7 * DAY).toISOString().slice(0, 10);

export function programWeek(start: string, today: string) {
  const days = Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY);
  return days < 0 ? 0 : Math.min(11, Math.floor(days / 7) + 1);
}

const statusOf = (weeks: [number, number], current: number): RoundStatus =>
  current < weeks[0] ? 'upcoming' : current > weeks[1] ? 'done' : 'live';

const better = (x: Score | null, y: Score | null) => {
  const xs = x?.score ?? -1, ys = y?.score ?? -1;
  return xs !== ys ? xs - ys : (x?.greens ?? 0) - (y?.greens ?? 0);
};

export function buildBracket(
  cohorts: BracketCohort[], weeks: BracketWeek[], members: BracketMember[], start: string | null, today: string,
): Bracket {
  const currentWeek = start ? programWeek(start, today) : 0;
  const rounds: Round[] = ROUNDS.map((r) => ({ ...r, status: statusOf(r.weeks, currentWeek) }));
  const cohortOf = new Map(members.filter((m) => m.role === 'participant' && m.status !== 'removed').map((m) => [m.id, m.cohort_id]));

  // Average points per participant-week over program weeks [from, to], up to now
  const score = (cohortId: string, [from, to]: [number, number]): Score => {
    if (!start || currentWeek < from) return { score: null, greens: 0 };
    const weekStarts = new Set<string>();
    for (let w = from; w <= Math.min(to, currentWeek); w++) weekStarts.add(addWeeks(start, w - 1));
    let pts = 0, greens = 0, n = 0;
    for (const r of weeks) {
      if (!weekStarts.has(r.week_start_date) || cohortOf.get(r.user_id) !== cohortId) continue;
      pts += Number(r.total_points); n += 1;
      greens += Object.values(r.band_per_category ?? {}).filter((b) => b === 'green').length;
    }
    return n ? { score: Math.round((pts / n) * 10) / 10, greens: greens / n } : { score: 0, greens: 0 };
  };

  const [r1Round, qfRound, sfRound, finalRound] = rounds;

  // Round 1: everyone, ranked
  const r1Scores = cohorts.map((c) => ({ cohort: c, ...score(c.id, r1Round.weeks) }));
  r1Scores.sort((x, y) => better(y, x) || x.cohort.name.localeCompare(y.cohort.name));
  const r1: Standing[] = r1Scores.map((s, i) => ({
    ...s, rank: i + 1,
    advancing: r1Round.status !== 'upcoming' && (cohorts.length <= ADVANCE_FROM_R1 || i < ADVANCE_FROM_R1),
  }));

  const play = (a: BracketCohort | null, b: BracketCohort | null, round: Round): Match => {
    if (round.status === 'upcoming' || !a || !b) {
      // A missing opponent is a bye: the other side moves on
      return { a, b, aScore: null, bScore: null, leader: round.status !== 'upcoming' ? (a ?? b)?.id ?? null : null };
    }
    const aScore = score(a.id, round.weeks), bScore = score(b.id, round.weeks);
    const d = better(aScore, bScore) || b.name.localeCompare(a.name);
    return { a, b, aScore, bScore, leader: d >= 0 ? a.id : b.id };
  };
  const winner = (m: Match, round: Round) => (round.status === 'done' && m.leader
    ? [m.a, m.b].find((c) => c?.id === m.leader) ?? null : null);

  // Quarterfinals: seeds from Round 1, once it's over
  const seeds: (BracketCohort | null)[] = r1Round.status === 'done'
    ? Array.from({ length: ADVANCE_FROM_R1 }, (_, i) => r1[i]?.cohort ?? null)
    : Array(ADVANCE_FROM_R1).fill(null);
  const qf = [[0, 7], [3, 4], [1, 6], [2, 5]].map(([x, y]) => play(seeds[x], seeds[y], qfRound));
  const sf = [[0, 1], [2, 3]].map(([x, y]) => play(winner(qf[x], qfRound), winner(qf[y], qfRound), sfRound));
  const final = play(winner(sf[0], sfRound), winner(sf[1], sfRound), finalRound);

  return { currentWeek, rounds, r1, qf, sf, final, champion: winner(final, finalRound) };
}
