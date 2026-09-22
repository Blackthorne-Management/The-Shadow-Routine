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
  create role anon; create role authenticated;
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
await as(null, `update profiles set role='admin', status='active', activated_at=now() where id=$1`, [ADMIN]);
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
const goals = [
  { category: 'gym', theme: 'gym', goal_type: 'binary', label: 'Workout 4x, 30+ min', prompt: 'Did you complete a workout today (30+ minutes)?', target_value: 4, unit: 'workouts' },
  { category: 'refraining', theme: 'refraining', goal_type: 'inverse', label: 'No alcohol', prompt: 'Did you avoid alcohol today?', target_value: 7, unit: 'days' },
  { category: 'custom_1', theme: 'reading', goal_type: 'percentage', label: 'Read 200 pages', prompt: 'How many pages did you read today?', target_value: 200, unit: 'pages' },
  { category: 'custom_2', theme: 'content', goal_type: 'binary', label: 'Post 5x', prompt: 'Did you post today?', target_value: 5, unit: 'days' },
  { category: 'custom_3', theme: 'word', goal_type: 'binary', label: 'Keep my word', prompt: 'Did you keep every promise today?', target_value: 7, unit: 'days' },
];
for (const u of [U1, U2]) await as(u, `select submit_goals($1)`, [JSON.stringify(goals)]);
assert.equal((await one(`select count(*)::int n from goals where user_id=$1`, [U1])).n, 5);
assert.equal((await one(`select category_point_max m from goals where user_id=$1 and category='gym'`, [U1])).m, 300);
await assert.rejects(as(U1, `select submit_checkin('[]', null)`), /NOT_ACTIVE/);
await assert.rejects(as(U1, `select approve_goals($1, '[]')`, [U1]), /ADMIN_ONLY/);

const gymId = (await one(`select id from goals where user_id=$1 and category='gym'`, [U1])).id;
await as(ADMIN, `select approve_goals($1, $2)`, [U1, JSON.stringify([{ id: gymId, target_value: 5 }])]);
await as(ADMIN, `select approve_goals($1, '[]')`, [U2]);
assert.equal((await one(`select target_value::int t from goals where id=$1`, [gymId])).t, 5);
assert.equal((await one(`select status from profiles where id=$1`, [U1])).status, 'active');
await assert.rejects(as(U1, `select submit_goals($1)`, [JSON.stringify(goals)]), /GOALS_LOCKED/);
console.log('✓ goal proposal + admin approval');

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
await as(U1, `select submit_checkin($1, true)`, [JSON.stringify(entries)]);
// same-day edit overwrites instead of duplicating
entries[2].value = 50;
await as(U1, `select submit_checkin($1, true)`, [JSON.stringify(entries)]);
assert.equal((await one(`select count(*)::int n from daily_entries where user_id=$1`, [U1])).n, 5);
const live = await one(`select * from weekly_scores where user_id=$1`, [U1]);
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
assert.match(pun.punishment_description, /reflection/);
assert.equal((await one(`select finalize_week($1::date) n`, [W])).n, 0, 'finalize is idempotent');
console.log('✓ weekly scoring math, bands, bonus cap, punishments');

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

console.log('\nAll SQL tests passed.');
