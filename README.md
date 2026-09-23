# The Shadow Routine

Installable PWA for the Shadow Routine accountability pilot: daily one-question-at-a-time check-ins,
weighted weekly scoring, a live leaderboard, and a punishment/proof system with an admin dashboard.

**Stack:** Vite + React + TypeScript · Supabase (Postgres, Auth, Realtime, Storage, Edge Functions, pg_cron) · Netlify · Web Push (VAPID)

## How it fits together

| Piece | Where |
|---|---|
| Schema, row-level security, storage bucket | `supabase/migrations/…01_schema.sql` |
| Signup/invite redemption, check-ins, scoring engine, punishments | `supabase/migrations/…02_logic.sql` |
| Placeholder punishment library, bonus presets, weekly/daily cron jobs | `supabase/migrations/…03_seed_and_cron.sql` |
| Security hardening, pace-from-activation fix, push config from Vault | `supabase/migrations/…05` – `…07` |
| Push reminder sender (runs every 5 min) | `supabase/functions/send-reminders/` + `supabase/sql/schedule_reminders.sql` |
| Service worker (offline shell + push) and manifest | `public/sw.js`, `public/manifest.webmanifest` |
| App | `src/` (participant pages in `pages/`, admin in `pages/admin/`) |

Rules that matter for fairness run **in Postgres**, not the browser:

- **Invite codes** are redeemed atomically in a trigger on `auth.users`. A bad or used code blocks account creation.
- **Check-ins** go through `submit_checkin()`, which always writes to the participant's *local today*. Re-submitting the same day overwrites it (same-day edits), and past days can't be written.
- **Scoring** (`compute_week()`) re-runs on every check-in, so the leaderboard is live all week. The formula: `min(actual/target, 1) × category max` per category, green ≥80% / gray 60–79% / red <60%, bonus 7 each capped at 49. Ties go to whoever has more green categories.
- **Mid-week colors are only green or gray** (behind = "catch up"); red appears only when a week closes.
- **Two kinds of band color.** `band_per_category` is strict (% of the full weekly target) and is the only thing punishments use. `pace_band_per_category` asks "on track given how much of the week has passed?" and drives the leaderboard dots and Home progress colors, so nobody is red 8 hours into Monday. Yes/no goals owe whole days: a 4x/week gym goal owes nothing after day one. (`…04_pace_bands.sql`)
- **Finalization** (`finalize_week()`) runs Mondays at 12:00 UTC via pg_cron. It locks the week and creates a punishment for every red band. Anyone activated partway through the week is exempt that week.
- **The 12-week program** (`…08_program_workouts_months.sql`). The admin sets the Monday of program week 1 in **Admin → Program**.
  - The 2 prep weeks before it are credited as green at 100% of target.
  - **Months:** month 1 = prep + weeks 1–2, month 2 = weeks 3–6, month 3 = weeks 7–10. Each closes automatically when its last week is finalized.
  - **Gold Month (per goal):** the monthly total (default 80% of 4 weeks), 3+ green weeks, at most 1 gray and no red. It earns that goal's reward; Gold in all 3 months earns the big reward.
  - **Ultra tier (per month):** Gold if every goal is at 80%+ with no gray/red weeks; Green if every goal is at 75%+, at most 1 gray per goal and no red; below that, a plain average of 60%+ is Gray and under 60% is Red, which triggers the participant's Ultra Punishment.
  - Check-ins are blocked before week 1 and after week 10 (read-only).
- **Workouts:** each 30+ minute session is its own row and needs a photo/clip. With no photo, the participant asks the mentor, and it counts only if accepted. The mentor can reject any photo in **Admin → Workouts**, which re-scores the week.
- **Consequences:** each goal's red-week punishment, Gold reward and 3-Gold reward, plus the Ultra Punishment and "one wish", are written at signup and approved or edited by the mentor. Rewards are self-granted, and "Mark claimed" is optional.
- **Ranks** (`…09_ranks_emblems_chat.sql`). `cumulative_cycle_points` is the sum of every program week's `total_points` (max 10 × 1,049 = 10,490). It's separate from the weekly leaderboard and kept in sync by a trigger on `weekly_scores`.
  - 10 ranks, from Shadow Initiate (0) to The Eclipse (exactly 10,490). Levels 3–9 use male or female titles, chosen at signup; existing accounts pick once.
  - Crossing a threshold on check-in shows a Level Up screen.
  - Emblem art: source art goes in `/Emblems` (one file per title, e.g. `Ronin.jpg`). `npm run emblems` cuts each round emblem out of its checkerboard background into a transparent 512px WebP in `public/emblems/`. `public.emblems.image_url` points at it (`…14_female_titles_emblem_art.sql`). Any rank without art shows a placeholder shield.
- **Cohort chat:** a `messages` table scoped to `cohort_id` (one cohort today), live via Realtime. Members post as themselves into their own cohort. The mentor can post (labelled Mentor) and delete; nobody edits.
- **Notifications** (`…10_notifications_global_chat.sql`). App events call `notify()`, which writes to the `notifications` inbox (the bell), only if the recipient's preference for that type is on. A trigger then pushes each new row immediately through `send-reminders` with `{notification_id}`.
  - Participants hear about: approval, workout reviews, punishments, proof reviews, rewards, cohort chat and Everyone chat, plus the nightly reminder.
  - The mentor hears about: goal submissions, no-photo workouts, submitted proof and chat.
  - Everyone picks their types in **Me → Notifications**. Defaults are all on except Everyone chat.
- **Chat channels:** Cohort (your cohort) and Everyone (all participants, for when there are several cohorts).
- **Mentors** (`…12_mentor_participation.sql`). Invite codes carry a role; a `mentor` code creates an active mentor (admin).
  - A mentor can switch on `mentor_participates` to set goals (`mentor_save_goals`, edited in place) and check in.
  - They're scored and shown on the board but unranked (`consistency_rank` null, never top), and are never punished.
- **Admins vs Mentors** (`…13_admin_roles_dms.sql`). Staff are `role = 'admin'`; staff with `is_super_admin` are **Admins**, the rest are **Mentors**. The founder account is an Admin; anyone who joins with a mentor link is a Mentor.
  - Both: approvals, workout and proof review, bonus, fallbacks, participant invites, chat moderation, and the pending-item badges.
  - Admin only: reading anyone's direct messages (**Admin → DMs**), program dates and month close-outs (**Program**), finalizing a week, removing participants, and mentor invite links. Enforced in SQL (`is_super_admin()`), not just hidden in the UI.
- **Direct messages:** `messages` rows with `channel = 'dm'` and a `recipient_id`. The two people read them, Admins can read all, and Mentors can't read other people's. Anyone active can DM anyone in their cohort or any staff member (`can_dm`). Unread counts come from `dm_reads` / `my_dm_threads()`. The recipient gets a `direct_messages` notification. The DM screen tells people Admins can see DMs.
- **Staff badges:** `admin_pending_counts()` gives goal submissions, no-photo workout asks, and proof to review. The counts show on the Admin/Mentor tab and on each section.
- **Infractions:** a rejected proof logs #1 (a warning, and the participant sees a "talk to your mentor" notice). #2 surfaces a manual **Remove participant** button for the admin.

## Setup

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. **Database → Extensions:** enable `pg_cron` and `pg_net`.
3. Apply the migrations in order. You can paste each file from `supabase/migrations/` into the SQL editor, or use the CLI:
   ```bash
   npx supabase link --project-ref YOUR-REF
   npx supabase db push
   ```
4. **Authentication → URL Configuration:** set Site URL to your Netlify URL.
   **Authentication → Providers → Email:** choose whether to require email confirmation. Either works, and the join screen handles both.
5. Create your admin account by following `supabase/sql/bootstrap_admin.sql`: mint a code, sign up in the app, then promote yourself.

### 2. Push notifications

1. Deploy the function with JWT verification off. It authenticates the cron caller with a shared secret instead:
   ```bash
   npx supabase functions deploy send-reminders --no-verify-jwt
   ```
2. Generate a VAPID key pair with `npm run vapid`, and make up a long random cron secret.
3. Fill in the placeholders in `supabase/sql/schedule_reminders.sql` and run it once in the SQL editor. It stores the keys and secret encrypted in **Vault** and schedules the 5-minute job. The function reads the same Vault entries through `push_config()`, which only the service role can call, so no secrets end up in the repo or the dashboard. (Edge Function secrets named `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` and `CRON_SECRET` override Vault if you set them.)
4. Put the **public** key in `VITE_VAPID_PUBLIC_KEY`.

### 3. Netlify

Connect the GitHub repo. `netlify.toml` already sets the build. Add these environment variables:

```
VITE_SUPABASE_URL=https://YOUR-REF.supabase.co
VITE_SUPABASE_ANON_KEY=...
VITE_VAPID_PUBLIC_KEY=...     # public half only
```

### 4. Local dev

```bash
cp .env.example .env    # fill in values
npm install
npm run dev
npm run test:sql        # runs migrations + full lifecycle tests in in-memory Postgres
```

## Testing push on an iPhone

Push only works on iOS 16.4+ **after** the app is added to the Home Screen. Open the site in Safari, tap Share, then Add to Home Screen. Open it from the Home Screen and go to Settings, then Turn on reminders. A local test notification confirms permission right away. The server reminder arrives within 5 minutes of the chosen time (it's skipped if you've already checked in that day).

Check the job with `select * from cron.job_run_details order by start_time desc limit 20;`, and see the function's logs in the Supabase dashboard.

## Open decisions (placeholders in place)

- **Fallback punishment library:** only used when a goal has no red-week punishment of its own. Every entry is marked `[Placeholder]`; edit them in **Admin → Fallbacks**.
- **Check-in wording:** each goal stores its own question. Defaults are generated from the goal (e.g. "Did you avoid alcohol today?"), and participants and the admin can rewrite any of them.
- **Branding:** based on the BRIK reference. Cream screen, deep-teal panels joined by small bridges, a lavender accent, pill buttons and Inter Tight. All tokens are at the top of `src/styles.css`, and icons are line SVGs in `src/components/Icon.tsx`. The app icon is `public/icons/icon.svg`; run `npm run icons` after changing it.
