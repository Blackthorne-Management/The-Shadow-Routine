// Bracket logic check (pure TS, bundled with esbuild). Run: node scripts/test-ultimate.mjs
import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { writeFileSync, rmSync } from 'node:fs';

await build({ entryPoints: ['src/lib/ultimate.ts'], bundle: true, format: 'esm', platform: 'node', outfile: '.ultimate-test.mjs', logLevel: 'error' });
const { buildBracket, programWeek } = await import(`../.ultimate-test.mjs?${Date.now()}`);
rmSync('.ultimate-test.mjs');

const START = '2026-09-21';
const week = (n) => new Date(Date.parse(`${START}T00:00:00Z`) + (n - 1) * 7 * 86400000).toISOString().slice(0, 10);
const cohorts = Array.from({ length: 10 }, (_, i) => ({ id: `c${i}`, name: `Cohort ${String.fromCharCode(65 + i)}`, emblem_url: null, created_at: `${i}` }));
// Two members per cohort; cohort i scores 100 + 10*i every week, except where overridden
const members = cohorts.flatMap((c) => [0, 1].map((k) => ({ id: `${c.id}-m${k}`, cohort_id: c.id, role: 'participant', status: 'active' })))
  .concat([{ id: 'mentor', cohort_id: 'c0', role: 'admin', status: 'active' }]);
const pts = (c, w) => (w >= 3 && c === 2 ? 900 : 100 + 10 * c); // cohort C surges from week 3
const weeks = [];
for (let w = 1; w <= 10; w++) for (const m of members) {
  const c = Number(m.cohort_id.slice(1));
  weeks.push({ user_id: m.id, week_start_date: week(w), total_points: m.role === 'admin' ? 1049 : pts(c, w), band_per_category: {} });
}

assert.equal(programWeek(START, '2026-09-20'), 0);
assert.equal(programWeek(START, '2026-09-23'), 1);
assert.equal(programWeek(START, '2026-10-05'), 3);

// Week 1: Round 1 live, leaders marked, later rounds empty
let b = buildBracket(cohorts, weeks, members, START, '2026-09-23');
assert.deepEqual(b.rounds.map((r) => r.status), ['live', 'upcoming', 'upcoming', 'upcoming']);
assert.equal(b.r1[0].cohort.id, 'c9'); assert.equal(b.r1[0].score, 190);
assert.equal(b.r1.filter((s) => s.advancing).length, 8);
assert.ok(!b.r1.find((s) => s.cohort.id === 'c0').advancing && !b.r1.find((s) => s.cohort.id === 'c1').advancing);
assert.equal(b.qf[0].a, null, 'QF not seeded until Round 1 ends');
// The mentor's 1049 doesn't count
assert.equal(b.r1.find((s) => s.cohort.id === 'c0').score, 100);

// Week 3: QF live, seeded 1v8 (c9 v c2), 4v5, 2v7, 3v6
b = buildBracket(cohorts, weeks, members, START, '2026-10-06');
assert.deepEqual(b.rounds.map((r) => r.status), ['done', 'live', 'upcoming', 'upcoming']);
assert.deepEqual(b.qf.map((m) => [m.a.id, m.b.id]), [['c9', 'c2'], ['c6', 'c5'], ['c8', 'c3'], ['c7', 'c4']]);
assert.equal(b.qf[0].leader, 'c2', 'the 8 seed surging leads the 1 seed');

// Week 7: SF done → final c2 vs c8
b = buildBracket(cohorts, weeks, members, START, '2026-11-03');
assert.deepEqual(b.rounds.map((r) => r.status), ['done', 'done', 'done', 'live']);
assert.deepEqual(b.sf.map((m) => [m.a.id, m.b.id]), [['c2', 'c6'], ['c8', 'c7']]);
assert.deepEqual([b.final.a.id, b.final.b.id], ['c2', 'c8']);
assert.equal(b.champion, null);

// After week 10: champion
b = buildBracket(cohorts, weeks, members, START, '2026-12-01');
assert.equal(b.champion.id, 'c2');

// Fewer cohorts: byes
b = buildBracket(cohorts.slice(0, 5), weeks, members, START, '2026-10-06');
assert.equal(b.r1.filter((s) => s.advancing).length, 5);
assert.equal(b.qf[0].leader, b.qf[0].a.id, 'a bye moves the top seed on');
console.log('✓ Ultimate Shadow bracket: scoring, seeding, rounds, byes, champion');
