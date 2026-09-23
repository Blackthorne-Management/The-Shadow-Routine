// Load test: N simulated members doing an evening check-in rush at the same
// time. Each one signs in, opens Today, checks in, opens the board, sometimes
// chats, and keeps a live (Realtime) board subscription open. It prints the
// latency of each step (p50 / p95 / max) and every error.
//
// Run it against a Supabase BRANCH or a copy of the project, not production:
//   SUPABASE_URL=https://<branch-ref>.supabase.co \
//   SUPABASE_ANON_KEY=<publishable key> \
//   SUPABASE_SERVICE_ROLE_KEY=<service role key>   (to create/delete test users) \
//   node scripts/load-test.mjs --users 120 --minutes 3
//
// It refuses to run against the production project unless you pass
// --i-know-this-is-production. Test users are named loadtest_N and removed
// at the end (--keep to leave them).
import { createClient } from '@supabase/supabase-js';
import { randomBytes, randomUUID } from 'node:crypto';

const PRODUCTION_REF = 'vkktttihfmthzswwalgn';
const args = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i < 0 ? dflt : (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true);
};
const USERS = Number(flag('users', 100));
const MINUTES = Number(flag('minutes', 3));
const KEEP = !!flag('keep', false);
const { SUPABASE_URL: URL, SUPABASE_ANON_KEY: ANON, SUPABASE_SERVICE_ROLE_KEY: SERVICE } = process.env;

if (!URL || !ANON || !SERVICE) {
  console.error('Set SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY (see the top of this file).');
  process.exit(1);
}
if (URL.includes(PRODUCTION_REF) && !flag('i-know-this-is-production', false)) {
  console.error('This is the production project. Use a branch, or pass --i-know-this-is-production.');
  process.exit(1);
}

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
const stats = new Map();
const errors = [];
async function timed(step, fn) {
  const t = performance.now();
  try {
    const r = await fn();
    if (r?.error) throw r.error;
    return r;
  } catch (e) {
    errors.push(`${step}: ${e.message ?? e}`);
  } finally {
    const a = stats.get(step) ?? [];
    a.push(performance.now() - t);
    stats.set(step, a);
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pct = (a, p) => a.sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(p * a.length))];

// --- Set up: a cohort's worth of active members with the five required goals
const GOALS = [
  { category: 'gym', theme: 'gym', goal_type: 'percentage', label: '4 workouts', target_value: 4, unit: 'workouts', category_point_max: 300 },
  { category: 'refraining', theme: 'refraining', goal_type: 'inverse', label: 'No sugar', target_value: 7, unit: 'days', category_point_max: 200 },
  { category: 'custom_1', theme: 'reading', goal_type: 'percentage', label: '7 chapters / week', target_value: 7, unit: 'chapters', category_point_max: 200 },
  { category: 'custom_2', theme: 'nutrition', goal_type: 'binary', label: 'Follow my Keto diet', target_value: 6, unit: 'days', category_point_max: 150 },
  { category: 'custom_3', theme: 'word', goal_type: 'binary', label: 'Keep my word', target_value: 7, unit: 'days', category_point_max: 150 },
];
console.log(`Creating ${USERS} test members…`);
const users = [];
for (let i = 0; i < USERS; i++) {
  const code = `LOAD-${randomBytes(5).toString('hex').toUpperCase()}`;
  const email = `loadtest_${i}_${Date.now()}@example.invalid`;
  const password = randomBytes(18).toString('base64url');
  await admin.from('invite_codes').insert({ code, note: 'load test' });
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { invite_code: code, username: `loadtest_${i}_${randomUUID().slice(0, 4)}`, display_name: `Load ${i}`, timezone: 'America/New_York', sex: i % 2 ? 'female' : 'male' },
  });
  if (error) { console.error('createUser failed:', error.message); process.exit(1); }
  const id = data.user.id;
  await admin.from('profiles').update({ status: 'active', activated_at: new Date(Date.now() - 86400000).toISOString(), onboarded_at: new Date().toISOString() }).eq('id', id);
  await admin.from('goals').insert(GOALS.map((g) => ({ ...g, user_id: id, prompt: 'x', status: 'approved' })));
  users.push({ id, email, password });
}

// --- The rush
console.log(`Simulating ${USERS} members for ${MINUTES} min…`);
const until = Date.now() + MINUTES * 60_000;
let realtimeEvents = 0;
async function member(u, i) {
  await sleep(Math.random() * 20_000); // people arrive over ~20 s
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  await timed('sign in', () => c.auth.signInWithPassword({ email: u.email, password: u.password }));
  const ch = c.channel(`lt-${i}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'weekly_scores' }, () => { realtimeEvents += 1; })
    .subscribe();
  const goals = (await c.from('goals').select('id,category').eq('user_id', u.id)).data ?? [];
  while (Date.now() < until) {
    await timed('open Today (refresh + context)', async () => {
      const r = await c.rpc('refresh_current_week');
      if (r.error) return r;
      return c.rpc('today_context');
    });
    await timed('check in', () => c.rpc('submit_checkin', {
      p_entries: goals.filter((g) => g.category !== 'gym').map((g) => ({ goal_id: g.id, value: g.category === 'custom_1' ? 1 + Math.floor(Math.random() * 3) : Number(Math.random() < 0.8) })),
      p_bonus: null, p_workouts: [],
    }));
    await timed('open Board', () => c.from('weekly_scores').select('*').limit(200));
    if (Math.random() < 0.3) {
      const me = (await c.from('profiles').select('cohort_id').eq('id', u.id).single()).data;
      await timed('chat message', () => c.from('messages').insert({ channel: 'cohort', cohort_id: me.cohort_id, user_id: u.id, message_text: 'load test' }));
    }
    await sleep(5_000 + Math.random() * 10_000); // think time
  }
  await c.removeChannel(ch);
  await c.auth.signOut();
}
await Promise.all(users.map(member));

// --- Report
console.log('\nStep                              count    p50 ms   p95 ms   max ms');
for (const [step, a] of stats) {
  console.log(`${step.padEnd(32)} ${String(a.length).padStart(6)} ${pct(a, 0.5).toFixed(0).padStart(8)} ${pct(a, 0.95).toFixed(0).padStart(8)} ${Math.max(...a).toFixed(0).padStart(8)}`);
}
console.log(`\nRealtime events received: ${realtimeEvents}`);
console.log(`Errors: ${errors.length}`);
const byKind = errors.reduce((m, e) => m.set(e, (m.get(e) ?? 0) + 1), new Map());
for (const [e, n] of byKind) console.log(`  ${n}× ${e}`);

// --- Clean up
if (!KEEP) {
  console.log('\nRemoving test members…');
  for (const u of users) await admin.auth.admin.deleteUser(u.id);
  await admin.from('invite_codes').delete().eq('note', 'load test');
}
process.exit(0);
