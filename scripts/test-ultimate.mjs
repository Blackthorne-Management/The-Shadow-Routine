// The Ultimate Shadow bracket logic (pure TS, bundled with esbuild).
// Run: npm run test:bracket
import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';

await build({ entryPoints: ['src/lib/ultimate.ts'], bundle: true, format: 'esm', platform: 'node', outfile: '.ultimate-test.mjs', logLevel: 'error' });
const { buildBracket, programWeek, GREEN_WEEK } = await import(`../.ultimate-test.mjs?${Date.now()}`);
rmSync('.ultimate-test.mjs');

const START = '2026-09-21';
const weekStart = (n) => new Date(Date.parse(`${START}T00:00:00Z`) + (n - 1) * 7 * 86400000).toISOString().slice(0, 10);
const dayAfterWeek = (n) => new Date(Date.parse(`${START}T00:00:00Z`) + n * 7 * 86400000 + 86400000).toISOString().slice(0, 10);

// 100 people in 10 cohorts. Person i is green in week w when (i + w) % 10 < reliability(i),
// so higher i = more reliable. Everyone scores a little differently to avoid ties.
const people = Array.from({ length: 100 }, (_, i) => ({
  id: `p${i}`, display_name: `P${String(i).padStart(3, '0')}`, cohort_id: `c${i % 10}`, sex: null, rank_level: 1,
}));
const rows = [];
for (let w = 1; w <= 10; w++) for (let i = 0; i < 100; i++) {
  const reliability = Math.floor(i / 10) + 1; // 1..10 green weeks out of 10
  const green = (i + w) % 10 < reliability;
  rows.push({ user_id: `p${i}`, week_start_date: weekStart(w), total_points: green ? GREEN_WEEK + i : 400 + i });
}
// A late spiker: never green until a perfect week 9 (still just one win)
rows.filter((r) => r.user_id === 'p5' && r.week_start_date === weekStart(9)).forEach((r) => { r.total_points = 1049; });

assert.equal(programWeek(START, '2026-09-23'), 1);

// Week 1: nobody cut yet; next cut end of week 2 keeps 50
let b = buildBracket(people, rows, START, '2026-09-23');
assert.equal(b.inTheRunning.length, 100);
assert.equal(b.eliminated.length, 0);
assert.equal(b.nextCut, 2); assert.equal(b.keepAtNextCut, 50);
assert.equal(b.inTheRunning.filter((s) => s.safe).length, 50);
assert.deepEqual(b.schedule.map((s) => s.after), [100, 50, 50, 25, 25, 13, 7, 4, 2, 1], 'the published cut schedule');

// After week 2: 50 left, the rest eliminated in week 2
b = buildBracket(people, rows, START, dayAfterWeek(2));
assert.equal(b.inTheRunning.length, 50);
assert.ok(b.eliminated.every((s) => s.eliminatedWeek === 2));

// After week 6: 13 left
b = buildBracket(people, rows, START, dayAfterWeek(6));
assert.equal(b.inTheRunning.length, 13);

// After week 10: one winner, the most reliable people went deepest, the spiker went early
b = buildBracket(people, rows, START, dayAfterWeek(10));
assert.equal(b.inTheRunning.length, 1);
assert.ok(b.winner, 'a winner is crowned');
assert.ok(Number(b.winner.person.id.slice(1)) >= 90, 'the winner is one of the always-green people');
assert.equal(b.eliminated.find((s) => s.person.id === 'p5').eliminatedWeek, 2, "a late spike can't save you");
assert.deepEqual([...new Set(b.eliminated.map((s) => s.eliminatedWeek))].sort((x, y) => x - y), [2, 4, 6, 7, 8, 9, 10]);

// Ties at the cut line all stay (rounding up)
const twins = [0, 1, 2].map((i) => ({ id: `t${i}`, display_name: `T${i}`, cohort_id: 'c', sex: null, rank_level: 1 }));
const twinRows = [1, 2].flatMap((w) => twins.map((p) => ({ user_id: p.id, week_start_date: weekStart(w), total_points: 900 })));
b = buildBracket(twins, twinRows, START, dayAfterWeek(2));
assert.equal(b.inTheRunning.length, 3, 'everyone tied at the line stays');

// Wins beat points: two green weeks beat one perfect + one bad week
const duo = [{ id: 'steady', display_name: 'Steady' }, { id: 'spike', display_name: 'Spike' }]
  .map((p) => ({ ...p, cohort_id: 'c', sex: null, rank_level: 1 }));
const duoRows = [
  { user_id: 'steady', week_start_date: weekStart(1), total_points: 850 },
  { user_id: 'steady', week_start_date: weekStart(2), total_points: 850 },
  { user_id: 'spike', week_start_date: weekStart(1), total_points: 1049 },
  { user_id: 'spike', week_start_date: weekStart(2), total_points: 800 },
];
b = buildBracket(duo, duoRows, START, dayAfterWeek(2));
assert.equal(b.inTheRunning[0].person.id, 'steady');
assert.equal(b.eliminated[0].person.id, 'spike');
console.log('✓ Ultimate Shadow: individual bracket, cut schedule 100→1, wins over points, ties at the line, elimination weeks');
