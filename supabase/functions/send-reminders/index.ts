// Supabase Edge Function: send-reminders
// Two jobs, both authenticated with the shared x-cron-secret header:
//  1. Body {} — called every 5 minutes by pg_cron (supabase/sql/schedule_reminders.sql).
//     Sends the nightly reminder to each participant whose local reminder time has
//     arrived, at most once per local day, skipping anyone who's already checked in
//     or who turned the reminder off in their notification settings.
//  2. Body {notification_id} — called by a database trigger for each new in-app
//     notification (approvals, reviews, chat…); pushes that one notification.
//
// Config comes from Supabase Vault via public.push_config() (service role only):
//   vapid_public_key, vapid_private_key, vapid_subject, cron_secret
// Edge Function secrets with the same names in UPPER_CASE override Vault if set.
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';

// A reminder fires if "now" is within this many minutes after the chosen time.
// Wider than the 5-minute cron interval so one late run doesn't skip anyone.
const WINDOW_MINUTES = 15;

// Projects expose the service key as either the legacy env var or the newer JSON map
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  ?? JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}').default;
const db = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey, { auth: { persistSession: false } });

let config: Record<string, string> | null = null;
async function getConfig() {
  if (config) return config;
  const { data, error } = await db.rpc('push_config');
  if (error) throw new Error(`push_config: ${error.message}`);
  const vault = (data ?? {}) as Record<string, string>;
  const pick = (name: string) => Deno.env.get(name.toUpperCase()) ?? vault[name];
  config = {
    publicKey: pick('vapid_public_key'),
    privateKey: pick('vapid_private_key'),
    subject: pick('vapid_subject') ?? 'mailto:admin@example.com',
    cronSecret: pick('cron_secret'),
  };
  webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
  return config;
}

/** Local date (YYYY-MM-DD) and minutes-since-midnight in a timezone. */
function localNow(tz: string, now: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  };
}

Deno.serve(async (req) => {
  let cfg;
  try { cfg = await getConfig(); } catch (e) { return new Response((e as Error).message, { status: 500 }); }
  if (!cfg.cronSecret || req.headers.get('x-cron-secret') !== cfg.cronSecret) {
    return new Response('unauthorized', { status: 401 });
  }

  const payload = await req.json().catch(() => ({})) as { notification_id?: string };
  if (payload.notification_id) return pushOne(payload.notification_id);

  const { data: rows, error } = await db
    .from('notification_settings')
    .select('user_id, reminder_time, timezone, push_subscription, last_notified_on, prefs, profiles!inner(status, role)')
    .eq('enabled', true)
    .not('push_subscription', 'is', null)
    .eq('profiles.status', 'active')
    .eq('profiles.role', 'participant');
  if (error) return new Response(error.message, { status: 500 });

  const now = new Date();
  const results = { checked: rows?.length ?? 0, due: 0, sent: 0, skipped_logged: 0, expired: 0, failed: 0 };

  for (const r of rows ?? []) {
    if ((r.prefs as Record<string, boolean> | null)?.daily_reminder === false) continue;
    let local;
    try { local = localNow(r.timezone, now); } catch { continue; } // bad timezone string
    const [h, m] = String(r.reminder_time).split(':').map(Number);
    const delta = local.minutes - (h * 60 + m);
    if (delta < 0 || delta >= WINDOW_MINUTES || r.last_notified_on === local.date) continue;
    results.due++;

    // Mark first so an overlapping run can't double-send
    await db.from('notification_settings').update({ last_notified_on: local.date }).eq('user_id', r.user_id);

    const { count } = await db.from('daily_entries').select('id', { count: 'exact', head: true })
      .eq('user_id', r.user_id).eq('entry_date', local.date);
    if ((count ?? 0) > 0) { results.skipped_logged++; continue; }

    try {
      await webpush.sendNotification(r.push_subscription, JSON.stringify({
        title: 'The Shadow Routine',
        body: "Time to log today's Shadow Routine tasks.",
        url: '/checkin',
        tag: `reminder-${local.date}`,
      }), { TTL: 60 * 60 * 3 });
      results.sent++;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        // Subscription is gone (app deleted / permission revoked)
        await db.from('notification_settings').update({ push_subscription: null, enabled: false }).eq('user_id', r.user_id);
        results.expired++;
      } else {
        console.error('push failed', r.user_id, status, (e as Error).message);
        results.failed++;
      }
    }
  }

  return Response.json(results);
});

/** Push a single in-app notification to its recipient's device, if they have push on. */
async function pushOne(id: string) {
  const { data: n } = await db.from('notifications').select('id, user_id, type, title, body, url').eq('id', id).maybeSingle();
  if (!n) return Response.json({ sent: 0, reason: 'not found' });
  const { data: s } = await db.from('notification_settings').select('push_subscription, enabled')
    .eq('user_id', n.user_id).maybeSingle();
  if (!s?.enabled || !s.push_subscription) return Response.json({ sent: 0, reason: 'push off' });
  try {
    await webpush.sendNotification(s.push_subscription, JSON.stringify({
      title: n.title, body: n.body ?? '', url: n.url,
      // Chat collapses into one notification per channel; everything else stacks
      tag: n.type.endsWith('_messages') ? `chat-${n.type}` : `n-${n.id}`,
    }), { TTL: 60 * 60 * 24 });
    return Response.json({ sent: 1 });
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) {
      await db.from('notification_settings').update({ push_subscription: null, enabled: false }).eq('user_id', n.user_id);
      return Response.json({ sent: 0, reason: 'subscription expired' });
    }
    console.error('push failed', n.user_id, status, (e as Error).message);
    return Response.json({ sent: 0, reason: 'failed', status }, { status: 502 });
  }
}
