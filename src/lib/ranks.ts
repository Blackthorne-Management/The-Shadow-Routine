// The 10-level rank path over a 10-week cycle (max 10 × 1,049 = 10,490 pts).
// Titles diverge by path for levels 3–9. Mirrors public.emblems / rank_for().
import type { Sex } from './types';

export const CYCLE_MAX = 10490;

export const LEVELS: { level: number; threshold: number; male: string; female: string }[] = [
  { level: 1, threshold: 0, male: 'Shadow Initiate', female: 'Shadow Initiate' },
  { level: 2, threshold: 525, male: 'Shadow Apprentice', female: 'Shadow Apprentice' },
  { level: 3, threshold: 1350, male: 'Shadow Ronin', female: 'Shadow Oracle' },
  { level: 4, threshold: 2350, male: 'Shadow Blade', female: 'Shadow Huntress' },
  { level: 5, threshold: 3475, male: 'Shadow Berserker', female: 'Shadow Warrior' },
  { level: 6, threshold: 4710, male: 'Shadow Marshal', female: 'Shadow Valkyrie' },
  { level: 7, threshold: 6035, male: 'Shadow Warlord', female: 'Shadow Assassin' },
  { level: 8, threshold: 7450, male: 'Shadow Regent', female: 'Shadow Sovereign' },
  { level: 9, threshold: 8935, male: 'Shadow King', female: 'Shadow Queen' },
  { level: 10, threshold: 10490, male: 'The Eclipse', female: 'The Eclipse' },
];

export const titleFor = (level: number, sex: Sex | null | undefined) => {
  const l = LEVELS[Math.min(Math.max(level, 1), 10) - 1];
  return sex === 'female' ? l.female : l.male;
};

export const levelFor = (points: number) =>
  [...LEVELS].reverse().find((l) => points >= l.threshold)?.level ?? 1;

/** The next level up, or null at The Eclipse. */
export const nextLevel = (level: number) => (level >= 10 ? null : LEVELS[level]);
