// Supabase Edge Function: send-reminders
// Called every 5 minutes by pg_cron (see supabase/sql/schedule_reminders.sql).
// Sends a Web Push to each participant whose local reminder time has arrived,
// at most once per local day, and skips anyone who's already checked in.
//
// Secrets (supabase secrets set ...):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:you@example.com), CRON_SECRET
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';

// A reminder fires if "now" is within this many minutes after the chosen time.
// Wider than the 5-minute cron interval so one late run doesn't skip anyone.
const WINDOW_MINUTES = 15;

webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com',
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
);

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

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
  if (req.headers.get('x-cron-secret') !== Deno.env.get('CRON_SECRET')) {
    return new Response('unauthorized', { status: 401 });
  }

  const { data: rows, error } = await db
    .from('notification_settings')
    .select('user_id, reminder_time, timezone, push_subscription, last_notified_on, profiles!inner(status, role)')
    .eq('enabled', true)
    .not('push_subscription', 'is', null)
    .eq('profiles.status', 'active')
    .eq('profiles.role', 'participant');
  if (error) return new Response(error.message, { status: 500 });

  const now = new Date();
  const results = { due: 0, sent: 0, skipped_logged: 0, expired: 0, failed: 0 };

  for (const r of rows ?? []) {
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
