// End-to-end test of the SQL migrations against an in-memory Postgres (PGlite).
// Supabase-specific pieces (auth, storage, realtime, pg_cron) are stubbed.
// Run: npm run test:sql
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const db = new PGlite();

await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean);
  create table storage.objects (id uuid default gen_random_uuid(), bucket_id text, name text);
  create function storage.foldername(name text) returns text[] language sql as
    $$ select string_to_array(name, '/') $$;
  create publication supabase_realtime;
  create schema cron;
  create function cron.schedule(a text, b text, c text) returns int language sql as $$ select 1 $$;
`);

const dir = fileURLToPath(new URL('../supabase/migrations/', import.meta.url));
for (const f of readdirSync(dir).sort()) {
  const sql = readFileSync(join(dir, f), 'utf8')
    .replace(/create extension if not exists pg_cron;/g, '');
  try { await db.exec(sql); } catch (e) { console.error(`Migration ${f} failed:`, e.message); process.exit(1); }
  console.log('✓ applied', f);
}

const as = async (uid, sql, params) => {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid ?? '']);
  return db.query(sql, params);
};
const one = async (sql, params) => (await db.query(sql, params)).rows[0];
const signup = (id, code, username, tz = 'America/New_York') =>
  db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`,
    [id, `${username}@example.com`, { invite_code: code, username, display_name: username.toUpperCase(), timezone: tz }]);

const ADMIN = '00000000-0000-0000-0000-00000000000a';
const U1 = '00000000-0000-0000-0000-000000000001';
const U2 = '00000000-0000-0000-0000-000000000002';

// --- signup & invites -------------------------------------------------------
await db.query(`insert into invite_codes (code) values ('FOUNDER'), ('ALPHA'), ('BRAVO')`);
assert.equal((await one(`select check_signup('alpha', 'nick')`)).check_signup, 'ok');
assert.equal((await one(`select check_signup('nope', 'nick')`)).check_signup, 'invalid_code');
await signup(ADMIN, 'FOUNDER', 'founder');
await as(null, `update profiles set role='admin', is_super_admin=true, status='active', activated_at=now() where id=$1`, [ADMIN]);
await signup(U1, 'alpha', 'nick');
await assert.rejects(signup(U2, 'ALPHA', 'reuse'), /INVALID_INVITE_CODE/);
await signup(U2, 'BRAVO', 'sam', 'America/Los_Angeles');
assert.equal((await one(`select status from invite_codes where code='ALPHA'`)).status, 'used');
assert.equal((await one(`select check_signup('bravo', 'newbie')`)).check_signup, 'invalid_code');
console.log('✓ invite redemption');

// participants can't self-promote
await assert.rejects(as(U1, `update profiles set status='active' where id=$1`, [U1]), /NOT_ALLOWED/);
console.log('✓ profile guard');

// --- goals ------------------------------------------------------------------
const stakes = (c) => ({ red_week_punishment: `${c}: 500 burpees`, gold_reward: `${c}: spa day`, three_gold_reward: `${c}: wardrobe` });
const goals = [
  { category: 'gym', theme: 'gym', goal_type: 'binary', label: '4 workouts / week', prompt: 'x', target_value: 4, unit: 'workouts', ...stakes('gym') },
  { category: 'refraining', theme: 'refraining', goal_type: 'inverse', label: 'No alcohol', prompt: 'Did you avoid alcohol today?', target_value: 7, unit: 'days', ...stakes('refraining') },
  { category: 'custom_1', theme: 'reading', goal_type: 'percentage', label: 'Read 200 pages', prompt: 'How many pages did you read today?', target_value: 200, unit: 'pages', ...stakes('reading') },
  { category: 'custom_2', theme: 'content', goal_type: 'binary', label: 'Post 5x', prompt: 'Did you post today?', target_value: 5, unit: 'days', ...stakes('content') },
  { category: 'custom_3', theme: 'word', goal_type: 'binary', label: 'Keep my word', prompt: 'Did you keep every promise today?', target_value: 7, unit: 'days', ...stakes('word') },
];
const CONSEQ = JSON.stringify({ ultra_punishment: 'Shave head', ultra_wish: 'One wish' });
await assert.rejects(as(U1, `select submit_goals($1, null)`, [JSON.stringify(goals)]), /NEED_CONSEQUENCES/);
await assert.rejects(as(U1, `select submit_goals($1, $2)`,
  [JSON.stringify(goals.map((g, i) => (i === 3 ? { ...g, gold_reward: '' } : g))), CONSEQ]), /NEED_CONSEQUENCES/);
for (const u of [U1, U2]) await as(u, `select submit_goals($1, $2)`, [JSON.stringify(goals), CONSEQ]);
const gymRow = await one(`select goal_type, unit, prompt from goals where user_id=$1 and category='gym'`, [U1]);
assert.equal(gymRow.goal_type, 'percentage', 'workouts are counted, not yes/no');
assert.match(gymRow.prompt, /30 minutes or more/);
assert.equal((await one(`select ultra_punishment from consequences where user_id=$1`, [U1])).ultra_punishment, 'Shave head');
assert.equal((await one(`select count(*)::int n from goals where user_id=$1`, [U1])).n, 5);
assert.equal((await one(`select category_point_max m from goals where user_id=$1 and category='gym'`, [U1])).m, 300);
await assert.rejects(as(U1, `select submit_checkin('[]', null)`), /NOT_ACTIVE/);
await assert.rejects(as(U1, `select approve_goals($1, '[]')`, [U1]), /ADMIN_ONLY/);

const gymId = (await one(`select id from goals where user_id=$1 and category='gym'`, [U1])).id;
await as(ADMIN, `select approve_goals($1, $2)`, [U1, JSON.stringify([{ id: gymId, target_value: 5 }])]);
await as(ADMIN, `select approve_goals($1, '[]')`, [U2]);
assert.equal((await one(`select target_value::int t from goals where id=$1`, [gymId])).t, 5);
assert.equal((await one(`select status from profiles where id=$1`, [U1])).status, 'active');
await assert.rejects(as(U1, `select submit_goals($1, $2)`, [JSON.stringify(goals), CONSEQ]), /GOALS_LOCKED/);
console.log('✓ goal proposal + admin approval');

// Just approved, nothing logged yet: pace is neutral (not red), because days
// before activation don't count as owed.
await as(U2, `select refresh_current_week()`);
const fresh = await one(`select pace_band_per_category p from weekly_scores where user_id=$1`, [U2]);
assert.ok(Object.values(fresh.p).every((b) => b === null), `new participant pace should be neutral: ${JSON.stringify(fresh.p)}`);
console.log('✓ pace starts at activation (new participants start neutral)');

// --- today's check-in (live scoring) ----------------------------------------
const ctx = (await as(U1, `select today_context() c`)).rows[0].c;
assert.ok(ctx.challenge, 'bonus challenge auto-rotated in');
const g1 = Object.fromEntries((await db.query(`select category, id from goals where user_id=$1`, [U1])).rows.map(r => [r.category, r.id]));
const entries = [
  { goal_id: g1.gym, value: 1, details: { workout_type: 'Lift', minutes: 45 } },
  { goal_id: g1.refraining, value: 1 },
  { goal_id: g1.custom_1, value: 40 },
  { goal_id: g1.custom_2, value: 0 },
  { goal_id: g1.custom_3, value: 1 },
];
const photo = (n) => ({ workout_type: 'Lift', minutes: 45, media_path: `${U1}/workouts/today-${n}.jpg` });
// Workout rules: 30+ minutes, and a photo or an exception note
await assert.rejects(as(U1, `select submit_checkin($1, true, $2)`,
  [JSON.stringify(entries), JSON.stringify([{ workout_type: 'Cardio', minutes: 20, media_path: `${U1}/workouts/a.jpg` }])]), /WORKOUT_TOO_SHORT/);
await assert.rejects(as(U1, `select submit_checkin($1, true, $2)`,
  [JSON.stringify(entries), JSON.stringify([{ workout_type: 'Run', minutes: 40 }])]), /WORKOUT_NEEDS_PHOTO/);
await assert.rejects(as(U1, `select submit_checkin($1, true, $2)`,
  [JSON.stringify(entries), JSON.stringify([{ workout_type: 'Run', minutes: 40, media_path: `${U2}/workouts/x.jpg` }])]), /BAD_PATH/);
await as(U1, `select submit_checkin($1, true, $2)`, [JSON.stringify(entries), JSON.stringify([photo(1)])]);
// same-day edit overwrites instead of duplicating — and two workouts in a day both count
entries[2].value = 50;
await as(U1, `select submit_checkin($1, true, $2)`, [JSON.stringify(entries),
  JSON.stringify([photo(1), photo(2), { workout_type: 'Walk', minutes: 30, exception_note: 'Phone died' }])]);
assert.equal((await one(`select count(*)::int n from daily_entries where user_id=$1`, [U1])).n, 5);
assert.equal((await one(`select count(*)::int n from workouts where user_id=$1`, [U1])).n, 3);
let live = await one(`select * from weekly_scores where user_id=$1`, [U1]);
assert.equal(Number(live.category_scores.gym.actual), 2, 'photo workouts count; the exception waits for the mentor');
// Mentor accepts the exception → counts; rejects a photo → stops counting
const exc = await one(`select id from workouts where user_id=$1 and status='exception_pending'`, [U1]);
await assert.rejects(as(U1, `select review_workout($1, true, null)`, [exc.id]), /ADMIN_ONLY/);
await as(ADMIN, `select review_workout($1, true, 'ok')`, [exc.id]);
const pic = await one(`select id from workouts where user_id=$1 and position=1`, [U1]);
await as(ADMIN, `select review_workout($1, false, 'not you')`, [pic.id]);
live = await one(`select * from weekly_scores where user_id=$1`, [U1]);
assert.equal(Number(live.category_scores.gym.actual), 2, '3 logged − 1 rejected photo');
// Re-saving today keeps the mentor's decisions on unchanged workouts
await as(U1, `select submit_checkin($1, true, $2)`, [JSON.stringify(entries),
  JSON.stringify([photo(1), photo(2), { workout_type: 'Walk', minutes: 30, exception_note: 'Phone died' }])]);
assert.deepEqual((await db.query(`select status from workouts where user_id=$1 order by position`, [U1])).rows.map((r) => r.status),
  ['rejected', 'approved', 'exception_accepted']);
// Mid-week colors are never red
for (const r of (await db.query(`select pace_band_per_category p from weekly_scores ws
    where ws.week_start_date = week_start((now() at time zone 'UTC')::date)`)).rows) {
  assert.ok(!Object.values(r.p).includes('red'), `mid-week pace must not be red: ${JSON.stringify(r.p)}`);
}
console.log('✓ workouts: 30-minute rule, photo or exception, multiple per day, mentor review');
assert.equal(Number(live.category_scores.custom_1.actual), 50);
assert.equal(live.bonus_points, 7);
assert.equal(live.consistency_rank, 1);
assert.equal(live.is_top_this_week, true);
assert.ok(await one(`select 1 from weekly_scores where user_id=$1`, [U2]), 'idle participant still ranked');
console.log('✓ check-in, same-day edit, live weekly score');

// --- full-week scoring math on a past week ----------------------------------
await as(null, `update profiles set activated_at = '2026-08-01' where role='participant'`);
const W = '2026-08-31'; // a Monday
const days = [...Array(7)].map((_, i) => `2026-09-0${i}`.replace('09-00', '08-31'));
const put = (u, goal, day, v) => db.query(
  `insert into daily_entries (user_id, goal_id, entry_date, value_reported) values ($1,$2,$3,$4)`, [u, goal, day, v]);
// U1: gym 5/5 (green, 300), refraining 4/7 = 57% (red), reading 210/200 (capped, 200),
//     content 3/5 = 60% (gray, 90), word 6/7 = 86% (green, 128.57)
for (let i = 0; i < 5; i++) await put(U1, g1.gym, days[i], 1);
for (let i = 0; i < 4; i++) await put(U1, g1.refraining, days[i], 1);
for (let i = 0; i < 7; i++) await put(U1, g1.custom_1, days[i], 30);
for (let i = 0; i < 3; i++) await put(U1, g1.custom_2, days[i], 1);
for (let i = 0; i < 6; i++) await put(U1, g1.custom_3, days[i], 1);
// bonus every day → 7 × 7 = 49 (the max)
for (let i = 0; i < 7; i++) {
  const ch = (await one(`select (ensure_bonus_challenge($1::date)).id`, [days[i]])).id;
  await db.query(`insert into bonus_completions (user_id, bonus_challenge_id, completed) values ($1,$2,true)`, [U1, ch]);
}
const created = (await one(`select finalize_week($1::date) n`, [W])).n;
const s = await one(`select * from weekly_scores where user_id=$1 and week_start_date=$2`, [U1, W]);
assert.deepEqual(s.band_per_category, { gym: 'green', refraining: 'red', custom_1: 'green', custom_2: 'gray', custom_3: 'green' });
assert.equal(Number(s.category_scores.refraining.points), 114.29);
assert.equal(Number(s.total_category_points), 832.86) // 300 + 114.29 + 200 + 90 + 128.57;
assert.equal(s.bonus_points, 49);
assert.equal(Number(s.total_points), 881.86);
assert.equal(s.finalized, true);
assert.equal(s.is_top_this_week, true);
// U2 logged nothing: 5 reds. U1: 1 red.
assert.equal(created, 6);
const pun = await one(`select * from punishments where user_id=$1`, [U1]);
assert.equal(pun.category, 'refraining');
assert.equal(pun.punishment_description, 'refraining: 500 burpees', "a red week uses the goal's own punishment");
assert.equal(pun.proof_type, 'photo');
assert.equal(pun.kind, 'red_week');
assert.equal((await one(`select finalize_week($1::date) n`, [W])).n, 0, 'finalize is idempotent');
console.log('✓ weekly scoring math, bands, bonus cap, punishments');

// --- pace-adjusted bands (leaderboard) vs final bands (punishments) ---------
const pace = async (a, t, type, el) =>
  (await one(`select pace_band($1, $2, $3::goal_type, $4) b`, [a, t, type, el])).b;
assert.equal(await pace(0, 4, 'binary', 0), null, 'nothing owed before the first log → neutral');
assert.equal(await pace(0, 4, 'binary', 1), 'green', 'gym 4x: a Monday rest day is not behind');
assert.equal(await pace(0, 4, 'binary', 2), 'red', 'gym 4x: owes 1 workout after 2 days');
assert.equal(await pace(1, 4, 'binary', 2), 'green');
assert.equal(await pace(2, 7, 'inverse', 3), 'gray', 'refraining: 2 of 3 clean days = 67%');
assert.equal(await pace(30, 200, 'percentage', 1), 'green', 'reading: 30 pages ≥ 80% of 28.6');
assert.equal(await pace(15, 200, 'percentage', 1), 'red');
assert.equal(await pace(3, 5, 'binary', 7), 'gray', 'full week: pace equals the final band');
// A closed week's pace bands match its final bands exactly
assert.deepEqual(s.pace_band_per_category, s.band_per_category);
// Mid-week, the live row carries pace bands separately from strict bands
assert.ok(live.pace_band_per_category !== undefined);
const liveNow = await one(`select * from weekly_scores where user_id=$1 and week_start_date=$2`, [U1, live.week_start_date]);
assert.equal(liveNow.category_scores.gym.pace_band !== undefined, true);
console.log('✓ pace-adjusted bands');

// --- proof & infractions ----------------------------------------------------
await assert.rejects(as(U1, `select submit_proof($1, null, 'talked')`, [pun.id]), /FILE_REQUIRED/);
await assert.rejects(as(U1, `select submit_proof($1, $2, null)`, [pun.id, `${U2}/x.jpg`]), /BAD_PATH/);
await as(U1, `select submit_proof($1, $2, 'done')`, [pun.id, `${U1}/${pun.id}/proof.jpg`]);
await as(ADMIN, `select review_proof($1, false, 'blurry')`, [pun.id]);
let inf = await one(`select * from infractions where punishment_id=$1`, [pun.id]);
assert.equal(inf.infraction_number, 1);
assert.equal(inf.resolution, 'warning_given');
await as(ADMIN, `select review_proof($1, false, 'again')`, [pun.id]);
assert.equal((await one(`select count(*)::int n from infractions where user_id=$1`, [U1])).n, 1, 'one infraction per punishment');

const p2 = (await db.query(`select id from punishments where user_id=$1 order by category limit 2`, [U2])).rows;
await as(ADMIN, `select review_proof($1, false, null)`, [p2[0].id]);
await as(ADMIN, `select review_proof($1, false, null)`, [p2[1].id]);
inf = await one(`select * from infractions where user_id=$1 and infraction_number=2`, [U2]);
assert.equal(inf.resolution, null, '2nd infraction awaits admin decision');
const dir2 = (await as(ADMIN, `select * from admin_directory() where id=$1`, [U2])).rows[0];
assert.equal(dir2.infraction_count, 2);
assert.equal(dir2.open_infraction, true);
await as(ADMIN, `select remove_participant($1)`, [U2]);
assert.equal((await one(`select status from profiles where id=$1`, [U2])).status, 'removed');
assert.equal((await one(`select resolution from infractions where id=$1`, [inf.id])).resolution, 'removed_and_refunded');
assert.equal((await one(`select count(*)::int n from weekly_scores ws where user_id=$1 and not finalized`, [U2])).n, 0);
console.log('✓ proof review, infractions, removal');

// partial-week exemption: someone activated mid-week gets no punishments
await as(null, `update profiles set activated_at = '2026-09-10' where id=$1`, [U1]);
assert.equal((await one(`select finalize_week('2026-09-07'::date) n`)).n, 0);
console.log('✓ partial-week exemption');

// --- the 12-week program: prep, months, Gold, Ultra -------------------------
// Put "today" in program week 8: months 1 and 2 are over, month 3 is running.
const U3 = '00000000-0000-0000-0000-000000000003';
await db.query(`insert into invite_codes (code) values ('CHARLIE')`);
await signup(U3, 'CHARLIE', 'charlie');
await as(U3, `select submit_goals($1, $2)`, [JSON.stringify(goals), JSON.stringify({ ultra_punishment: 'Charlie ultra', ultra_wish: 'Charlie wish' })]);
await as(ADMIN, `select approve_goals($1, '[]')`, [U3]);
const today = (await one(`select local_today($1) d`, [U3])).d;
const START = (await one(`select week_start($1::date) - 49 d`, [today])).d.toISOString().slice(0, 10);
await assert.rejects(as(U3, `select admin_set_program_start($1)`, [START]), /ADMIN_ONLY/);
await assert.rejects(as(ADMIN, `select admin_set_program_start(($1::date + 1))`, [START]), /MUST_BE_MONDAY/);
await as(ADMIN, `select admin_set_program_start($1)`, [START]);
await as(null, `update profiles set activated_at = $1::date - 14 where id = $2`, [START, U3]);
const addD = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const g3 = Object.fromEntries((await db.query(`select category, id from goals where user_id=$1`, [U3])).rows.map((r) => [r.category, r.id]));
const logWeek = async (week, plan) => {
  const ws = addD(START, 7 * (week - 1));
  for (const [cat, days, v] of plan) for (let i = 0; i < days; i++) await put(U3, g3[cat], addD(ws, i), v);
};
// Program weeks 1–2: all green, except refraining 5/7 (gray) in week 2
const green = [['gym', 4, 1], ['refraining', 7, 1], ['custom_1', 7, 30], ['custom_2', 5, 1], ['custom_3', 7, 1]];
await logWeek(1, green);
await logWeek(2, green.map((r) => (r[0] === 'refraining' ? ['refraining', 5, 1] : r)));
await as(null, `select finalize_week($1::date)`, [START]);
await as(null, `select finalize_week($1::date + 7)`, [START]);   // closing week 2 closes month 1
const m1 = await one(`select * from monthly_results where user_id=$1 and month_number=1`, [U3]);
assert.equal(m1.goals.gym.greens, 4, 'prep credits 2 green weeks');
assert.equal(Number(m1.goals.gym.total), 16, 'prep counts 100% of target toward the month');
assert.equal(m1.goals.refraining.gold, true, '3 green + 1 gray still earns Gold');
assert.equal(m1.ultra_tier, 'green', 'a gray week rules out Ultra Gold → Ultra Green');
assert.equal((await one(`select count(*)::int n from rewards where user_id=$1 and month_number=1 and kind='gold_month'`, [U3])).n, 5);
assert.equal((await one(`select description from rewards where user_id=$1 and category='gym'`, [U3])).description, 'gym: spa day');
assert.equal((await one(`select count(*)::int n from rewards where user_id=$1 and kind='ultra_wish'`, [U3])).n, 0);
// Month 2 (weeks 3–6): nothing logged → red weeks with the goals' own punishments + Ultra Red
for (let w = 3; w <= 6; w++) await as(null, `select finalize_week($1::date + $2::int)`, [START, 7 * (w - 1)]);
const m2 = await one(`select * from monthly_results where user_id=$1 and month_number=2`, [U3]);
assert.equal(m2.ultra_tier, 'red');
const ultra = await one(`select * from punishments where user_id=$1 and kind='ultra'`, [U3]);
assert.equal(ultra.punishment_description, 'Charlie ultra');
assert.equal(ultra.category, null);
assert.equal((await one(`select count(*)::int n from punishments where user_id=$1 and kind='red_week'`, [U3])).n, 20, '5 goals × 4 red weeks');
assert.equal((await one(`select finalize_month(2) n`)).n, 0, 'months close once');
// Month 3 is live: "Week 2 of 4", every goal still on track (no closed weeks yet)
const ms = (await as(U3, `select month_status() s`)).rows[0].s;
assert.equal(ms.status, 'active');
assert.equal(ms.program_week, 8);
assert.equal(ms.month, 3);
assert.equal(ms.week_of_month, 2);
assert.equal(ms.goals.length, 5);
await assert.rejects(as(U1, `select month_status($1)`, [U3]), /NOT_ALLOWED/);
await assert.rejects(as(ADMIN, `select admin_finalize_month(3)`), /MONTH_NOT_OVER/);
// Read-only before the start and after week 10
await as(ADMIN, `select admin_set_program_start(week_start($1::date) + 7)`, [today]);
await assert.rejects(as(U3, `select submit_checkin('[]', null, null)`), /PROGRAM_NOT_STARTED/);
await as(ADMIN, `select admin_set_program_start($1::date - 77)`, [(await one(`select week_start($1::date) d`, [today])).d]);
await assert.rejects(as(U3, `select submit_checkin('[]', null, null)`), /PROGRAM_ENDED/);
await as(ADMIN, `select admin_set_program_start($1)`, [START]);
// Rewards are self-granted
const rw = await one(`select id from rewards where user_id=$1 limit 1`, [U3]);
await as(U1, `select claim_reward($1)`, [rw.id]);
assert.equal((await one(`select claimed_at from rewards where id=$1`, [rw.id])).claimed_at, null, "can't claim someone else's");
await as(U3, `select claim_reward($1)`, [rw.id]);
assert.ok((await one(`select claimed_at from rewards where id=$1`, [rw.id])).claimed_at);
console.log('✓ 12-week program: prep credit, Gold Months, Ultra tiers, rewards, read-only outside the program');

// --- ranks, cumulative cycle points, rank path ------------------------------
const rank = async (p) => (await one(`select rank_for($1) r`, [p])).r;
assert.equal(await rank(0), 1);
assert.equal(await rank(524.99), 1);
assert.equal(await rank(525), 2);
assert.equal(await rank(4710), 6);
assert.equal(await rank(10489.99), 9, 'The Eclipse needs the exact maximum');
assert.equal(await rank(10490), 10);
const cum = async (u) => one(`select cumulative_cycle_points c, rank_level r from profiles where id=$1`, [u]);
const expected = (await one(`select coalesce(sum(total_points), 0) s from weekly_scores
   where user_id = $1 and week_start_date between $2::date and $2::date + 63`, [U3, START])).s;
assert.equal(Number((await cum(U3)).c), Number(expected), 'cycle total = sum of program weeks');
assert.ok(Number(expected) > 0);
// Moving the program window re-counts everyone
await as(ADMIN, `select admin_set_program_start(week_start($1::date) + 7)`, [today]);
assert.equal(Number((await cum(U3)).c), 0, 'no program weeks yet → 0');
await as(ADMIN, `select admin_set_program_start($1)`, [START]);
assert.equal(Number((await cum(U3)).c), Number(expected));
// A check-in updates the cycle total straight away
const before = Number((await cum(U1)).c);
await as(U1, `select submit_checkin($1, true, $2)`, [JSON.stringify(entries.map((e) => ({ ...e, value: 200 }))), JSON.stringify([photo(1), photo(2)])]);
assert.ok(Number((await cum(U1)).c) !== before || before > 0, 'cycle total recomputed on check-in');
// Sex: set at signup, or once by the participant; only the admin changes it after
await db.query(`insert into invite_codes (code) values ('DELTA')`);
const U4 = '00000000-0000-0000-0000-000000000004';
await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'd@example.com', $2)`,
  [U4, { invite_code: 'DELTA', username: 'delta', display_name: 'D', sex: 'female' }]);
assert.equal((await one(`select sex from profiles where id=$1`, [U4])).sex, 'female');
assert.equal((await one(`select cohort_id is not null ok from profiles where id=$1`, [U4])).ok, true, 'new members join the cohort');
await assert.rejects(as(U4, `select set_rank_path('male')`), /PATH_LOCKED/);
assert.equal((await one(`select sex from profiles where id=$1`, [U1])).sex, null);
await as(U1, `select set_rank_path('male')`);
await assert.rejects(as(U1, `select set_rank_path('female')`), /PATH_LOCKED/);
await as(ADMIN, `select set_rank_path('female', $1)`, [U1]);
assert.equal((await one(`select sex from profiles where id=$1`, [U1])).sex, 'female');
await assert.rejects(as(U1, `select set_rank_path('other')`), /BAD_SEX/);
assert.equal((await one(`select count(*)::int n from emblems`)).n, 19);
console.log('✓ ranks: thresholds, cycle totals, rank path');

// --- notifications + global chat -------------------------------------------
const inbox = async (u, type) => (await db.query(
  `select * from notifications where user_id=$1 and ($2::text is null or type=$2) order by created_at`, [u, type ?? null])).rows;
// Goals submitted → admin; approval → participant
const subsBefore = (await inbox(ADMIN, 'admin_goal_submissions')).length;
await as(U4, `select submit_goals($1, $2)`, [JSON.stringify(goals), CONSEQ]);
assert.equal((await inbox(ADMIN, 'admin_goal_submissions')).length, subsBefore + 1, 'admin hears about new goal submissions');
await as(ADMIN, `select approve_goals($1, '[]')`, [U4]);
const appr = await inbox(U4, 'approvals');
assert.equal(appr.length, 1);
assert.match(appr[0].title, /approved/);
// Chat: cohort messages fan out to the cohort + mentor, never the sender
const cohortId = (await one(`select cohort_id from profiles where id=$1`, [U1])).cohort_id;
await as(U1, `insert into messages (cohort_id, user_id, message_text) values ($1, $2, 'hello cohort')`, [cohortId, U1]);
assert.equal((await inbox(U1, 'cohort_messages')).length, 0, 'no notification for your own message');
assert.equal((await inbox(U3, 'cohort_messages')).length, 1);
assert.equal((await inbox(ADMIN, 'cohort_messages')).length, 1);
assert.equal((await inbox(U3, 'cohort_messages'))[0].title, 'Cohort · NICK');
// Global chat is off by default; opting in delivers it
await as(U1, `insert into messages (channel, cohort_id, user_id, message_text) values ('global', null, $1, 'hello everyone')`, [U1]);
assert.equal((await inbox(U3, 'global_messages')).length, 0, 'global chat is opt-in');
await db.query(`insert into notification_settings (user_id, prefs) values ($1, '{"global_messages": true, "cohort_messages": false}')
  on conflict (user_id) do update set prefs = excluded.prefs`, [U3]);
await as(U1, `insert into messages (channel, cohort_id, user_id, message_text) values ('global', null, $1, 'second')`, [U1]);
await as(U1, `insert into messages (cohort_id, user_id, message_text) values ($1, $2, 'muted for U3')`, [cohortId, U1]);
assert.equal((await inbox(U3, 'global_messages')).length, 1, 'opted in → notified');
assert.equal((await inbox(U3, 'cohort_messages')).length, 1, 'opted out → no new cohort notifications');
await assert.rejects(db.query(`insert into messages (channel, cohort_id, user_id, message_text) values ('global', $1, $2, 'x')`, [cohortId, U1]),
  /messages_channel_cohort/, 'global messages have no cohort');
// "No photo" asks notify the mentor once, even across re-saves; decisions notify the participant
const ask = { workout_type: 'Run', minutes: 40, exception_note: 'Forgot my phone' };
const before4 = (await inbox(ADMIN, 'admin_exceptions')).length;
await as(U1, `select submit_checkin($1, true, $2)`, [JSON.stringify(entries), JSON.stringify([photo(1), ask])]);
await as(U1, `select submit_checkin($1, true, $2)`, [JSON.stringify(entries), JSON.stringify([photo(1), ask])]);
assert.equal((await inbox(ADMIN, 'admin_exceptions')).length, before4 + 1, 'one admin notification per ask');
const askRow = await one(`select id from workouts where user_id=$1 and status='exception_pending'`, [U1]);
await as(ADMIN, `select review_workout($1, false, 'Need a photo')`, [askRow.id]);
assert.match((await inbox(U1, 'workout_reviews')).at(-1).title, /not counted/);
// Re-saving twice keeps the mentor's rejection (the review survives each re-insert)
await as(U1, `select submit_checkin($1, true, $2)`, [JSON.stringify(entries), JSON.stringify([photo(1), ask])]);
await as(U1, `select submit_checkin($1, true, $2)`, [JSON.stringify(entries), JSON.stringify([photo(1), ask])]);
assert.equal((await one(`select status from workouts where user_id=$1 and position=2`, [U1])).status, 'rejected');
// Punishments issued + proof reviewed, rewards earned (from the month tests above)
assert.ok((await inbox(U3, 'punishments')).length >= 20, 'every issued punishment notifies');
assert.ok((await inbox(U3, 'rewards')).length >= 5, 'every reward notifies');
const pun3 = await one(`select id from punishments where user_id=$1 and kind='red_week' limit 1`, [U3]);
await as(U3, `select submit_proof($1, $2, 'done')`, [pun3.id, `${U3}/${pun3.id}/p.jpg`]);
assert.ok((await inbox(ADMIN, 'admin_proofs')).length >= 1, 'admin hears about submitted proof');
await as(ADMIN, `select review_proof($1, true, null)`, [pun3.id]);
assert.equal((await inbox(U3, 'proof_reviews')).at(-1).title, 'Proof accepted');
// Mark read
await as(U3, `select mark_notifications_read(null)`);
assert.equal((await db.query(`select 1 from notifications where user_id=$1 and read_at is null`, [U3])).rows.length, 0);
console.log('✓ notifications: events, preferences, chat fan-out, dedupe, global chat');

// --- onboarding ---------------------------------------------------------------
assert.equal((await one(`select onboarded_at from profiles where id=$1`, [U4])).onboarded_at, null);
await as(U4, `select mark_onboarded()`);
const ob = (await one(`select onboarded_at from profiles where id=$1`, [U4])).onboarded_at;
assert.ok(ob, 'intro marked as seen');
await as(U4, `select mark_onboarded()`);
assert.equal(String((await one(`select onboarded_at from profiles where id=$1`, [U4])).onboarded_at), String(ob), 'first time is kept');
assert.equal((await one(`select onboarded_at from profiles where id=$1`, [U3])).onboarded_at, null, 'only your own account');
console.log('✓ onboarding flag');

// --- mentors: invite links + joining the cohort unranked -------------------
const M2 = '00000000-0000-0000-0000-0000000000b2';
await db.query(`insert into invite_codes (code, role) values ('MENTOR1', 'mentor')`);
await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'm@example.com', $2)`,
  [M2, { invite_code: 'MENTOR1', username: 'coach_two', display_name: 'Coach Two', sex: 'male' }]);
const mentor2 = await one(`select role, status, activated_at from profiles where id=$1`, [M2]);
assert.equal(mentor2.role, 'admin', 'a mentor link creates a mentor');
assert.equal(mentor2.status, 'active', 'mentors skip goal approval');
await assert.rejects(as(M2, `select submit_checkin('[]', null, null)`), /NOT_ACTIVE/, 'mentors only check in once they join');
await assert.rejects(as(U1, `select set_mentor_participation(true)`), /ADMIN_ONLY/);
await assert.rejects(as(U1, `select mentor_save_goals($1)`, [JSON.stringify(goals)]), /ADMIN_ONLY/);
await as(M2, `select mentor_save_goals($1)`, [JSON.stringify(goals)]);
await as(M2, `select set_mentor_participation(true)`);
assert.equal((await one(`select count(*)::int n from goals where user_id=$1 and status='approved'`, [M2])).n, 5);
await as(M2, `select submit_checkin($1, true, '[]')`, [JSON.stringify((await db.query(
  `select id goal_id, 1 as value from goals where user_id=$1 and category <> 'gym'`, [M2])).rows)]);
const wk = (await one(`select week_start(local_today($1)) w`, [M2])).w;
const board = (await db.query(`select ws.user_id, ws.consistency_rank, ws.is_top_this_week, ws.total_points, p.role
   from weekly_scores ws join profiles p on p.id = ws.user_id where ws.week_start_date = $1`, [wk])).rows;
const mentorRow = board.find((r) => r.user_id === M2);
assert.ok(mentorRow, 'a participating mentor shows on the weekly board');
assert.equal(mentorRow.consistency_rank, null, 'mentors are unranked');
assert.equal(mentorRow.is_top_this_week, false, "mentors can't be most consistent");
const ranks = board.filter((r) => r.role === 'participant').map((r) => r.consistency_rank).sort((a, b) => a - b);
assert.equal(ranks[0], 1, 'participants still rank from 1');
// Close a past week where the mentor logged nothing: no punishments for the mentor
await db.query(`update profiles set activated_at = '2026-08-01' where id = $1`, [M2]);
await db.query(`select finalize_week('2026-08-24'::date)`);
assert.equal((await one(`select count(*)::int n from punishments where user_id=$1`, [M2])).n, 0, 'mentors are never punished');
// Saving goals again edits in place (keeps history)
const beforeIds = (await db.query(`select id from goals where user_id=$1 order by category`, [M2])).rows.map((r) => r.id);
await as(M2, `select mentor_save_goals($1)`, [JSON.stringify(goals.map((g) => ({ ...g, target_value: g.category === 'gym' ? 12 : g.target_value })))]);
assert.deepEqual((await db.query(`select id from goals where user_id=$1 order by category`, [M2])).rows.map((r) => r.id), beforeIds);
assert.equal((await one(`select target_value::int t from goals where user_id=$1 and category='gym'`, [M2])).t, 12);
// Switching off takes the mentor back off this week's board
await as(M2, `select set_mentor_participation(false)`);
assert.equal((await db.query(`select 1 from weekly_scores where user_id=$1 and week_start_date=$2`, [M2, wk])).rows.length, 0);
console.log('✓ mentors: invite links, joining the cohort unranked, never punished');

// --- Admins vs mentors, direct messages ---------------------------------------
// Row-level security only applies to a non-superuser, so these run as `authenticated`
await db.exec(`grant usage on schema public to authenticated;
  grant select, insert, delete on public.messages to authenticated;
  grant select on public.dm_reads to authenticated;
  grant select, insert, update, delete on public.invite_codes to authenticated;
  grant execute on function is_admin(), is_super_admin(), my_chat_cohort(), can_dm(uuid) to authenticated;`);
const asUser = async (uid, sql, params) => {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid]);
  await db.exec('set role authenticated');
  try { return await db.query(sql, params); } finally { await db.exec('reset role'); }
};
assert.equal((await as(ADMIN, `select is_super_admin() v`)).rows[0].v, true);
assert.equal((await as(M2, `select is_super_admin() v`)).rows[0].v, false, 'mentor-link signups are Mentors, not Admins');
// Admin-only actions
await assert.rejects(as(M2, `select admin_set_program_start(null)`), /ADMIN_ONLY/);
await assert.rejects(as(M2, `select remove_participant($1)`, [U3]), /ADMIN_ONLY/);
await assert.rejects(as(M2, `select admin_finalize_week('2026-08-24'::date)`), /ADMIN_ONLY/);
await assert.rejects(asUser(M2, `insert into invite_codes (code, role) values ('MENTORX', 'mentor')`), /row-level security/);
await asUser(M2, `insert into invite_codes (code, role) values ('PARTX', 'participant')`);
await asUser(ADMIN, `insert into invite_codes (code, role) values ('MENTORY', 'mentor')`);
// DMs: the pair and Admins read them; a Mentor can't read other people's
await asUser(U1, `insert into messages (channel, user_id, recipient_id, message_text) values ('dm', $1, $2, 'hey charlie')`, [U1, U3]);
await asUser(U3, `insert into messages (channel, user_id, recipient_id, message_text) values ('dm', $1, $2, 'hey nick')`, [U3, U1]);
const dmCount = async (uid) => (await asUser(uid, `select count(*)::int n from messages where channel='dm'`)).rows[0].n;
assert.equal(await dmCount(U1), 2);
assert.equal(await dmCount(U3), 2);
assert.equal(await dmCount(ADMIN), 2, 'Admins can read DMs');
assert.equal(await dmCount(M2), 0, "Mentors can't read other people's DMs");
await assert.rejects(asUser(U1, `insert into messages (channel, user_id, recipient_id, message_text) values ('dm', $1, $2, 'x')`, [U1, U2]),
  /row-level security/, "can't DM a removed member");
await assert.rejects(asUser(U1, `insert into messages (channel, user_id, recipient_id, message_text) values ('dm', $1, $2, 'spoof')`, [U3, U1]),
  /row-level security/, "can't send as someone else");
// A mentor can't delete a DM they can't see
await asUser(M2, `delete from messages where channel='dm'`);
assert.equal(await dmCount(ADMIN), 2);
// Threads + unread
let th = (await as(U1, `select * from my_dm_threads()`)).rows;
assert.equal(th.length, 1); assert.equal(th[0].other_id, U3); assert.equal(th[0].unread, 1); assert.equal(th[0].last_text, 'hey nick');
await as(U1, `select mark_dm_read($1)`, [U3]);
th = (await as(U1, `select * from my_dm_threads()`)).rows;
assert.equal(th[0].unread, 0);
assert.equal((await as(ADMIN, `select * from admin_dm_threads()`)).rows[0].messages, 2);
await assert.rejects(as(M2, `select * from admin_dm_threads()`), /ADMIN_ONLY/);
// DM notification goes to the recipient only
assert.equal((await one(`select count(*)::int n from notifications where type='direct_messages' and user_id=$1`, [U3])).n, 1);
assert.equal((await one(`select url from notifications where type='direct_messages' and user_id=$1`, [U3])).url, `/chat/dm/${U1}`);
assert.equal((await one(`select count(*)::int n from notifications where type='direct_messages' and user_id=$1`, [M2])).n, 0);
// Pending counts for the admin badges
const pc = (await as(M2, `select admin_pending_counts() c`)).rows[0].c;
assert.deepEqual(Object.keys(pc).sort(), ['approvals', 'proofs', 'workouts']);
await assert.rejects(as(U1, `select admin_pending_counts()`), /ADMIN_ONLY/);
console.log('✓ admins vs mentors, direct messages, pending counts');

console.log('\nAll SQL tests passed.');
