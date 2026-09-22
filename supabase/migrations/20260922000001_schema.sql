-- ============================================================================
-- The Shadow Routine — core schema
-- Tables, enums, row-level security, and storage.
-- Business logic (signup, check-ins, scoring, punishments) lives in 0002.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.user_role             as enum ('participant', 'admin');
create type public.user_status           as enum ('pending_approval', 'active', 'removed');
create type public.invite_status         as enum ('unused', 'used');
create type public.goal_category         as enum ('gym', 'refraining', 'custom_1', 'custom_2', 'custom_3');
create type public.goal_type             as enum ('percentage', 'binary', 'inverse');
create type public.goal_status           as enum ('pending_approval', 'approved');
-- "theme" is what a goal is *about*. Custom slots can be any theme, and the
-- punishment library is keyed by theme (e.g. schedule → "smash a watch").
create type public.goal_theme            as enum ('gym', 'refraining', 'reading', 'nutrition', 'schedule', 'word', 'content', 'other');
create type public.proof_type            as enum ('photo', 'video', 'mentor_conversation');
create type public.proof_status          as enum ('pending', 'accepted', 'rejected');
create type public.infraction_resolution as enum ('warning_given', 'removed_and_refunded');

-- ---------------------------------------------------------------------------
-- Profiles ("users" in the spec). Credentials live in auth.users.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id               uuid primary key references auth.users (id) on delete cascade,
  email            text,
  username         text not null unique check (username ~ '^[a-z0-9_]{3,24}$'),
  display_name     text not null check (char_length(display_name) between 1 and 40),
  role             public.user_role   not null default 'participant',
  invite_code_used text,
  status           public.user_status not null default 'pending_approval',
  timezone         text not null default 'UTC',
  activated_at     timestamptz,
  created_at       timestamptz not null default now()
);

create table public.invite_codes (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique
             default ('SHDW-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))),
  note       text,  -- who the admin made it for
  created_by uuid references public.profiles (id) on delete set null,
  used_by    uuid references public.profiles (id) on delete set null,
  status     public.invite_status not null default 'unused',
  used_at    timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Goals: exactly 5 per user (one per category)
--   percentage → target_value = weekly quantity (e.g. 200 pages)
--   binary     → target_value = qualifying days per week (e.g. 4 workouts)
--   inverse    → target_value = clean days per week (usually 7)
-- ---------------------------------------------------------------------------
create table public.goals (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.profiles (id) on delete cascade,
  category           public.goal_category not null,
  theme              public.goal_theme    not null,
  goal_type          public.goal_type     not null,
  label              text not null check (char_length(label) between 1 and 80),
  prompt             text not null check (char_length(prompt) between 1 and 160),  -- the daily check-in question
  target_value       numeric not null check (target_value > 0),
  unit               text not null check (char_length(unit) between 1 and 24),
  category_point_max int  not null,
  status             public.goal_status not null default 'pending_approval',
  approved_by        uuid references public.profiles (id),
  approved_at        timestamptz,
  created_at         timestamptz not null default now(),
  unique (user_id, category)
);

create table public.daily_entries (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles (id) on delete cascade,
  goal_id        uuid not null references public.goals (id) on delete cascade,
  entry_date     date not null,  -- the participant's *local* date
  value_reported numeric not null check (value_reported >= 0),  -- binary/inverse: 1 = yes, 0 = no
  notes          text,
  details        jsonb,  -- optional extras, e.g. gym: {"workout_type": "Lift", "minutes": 45}
  submitted_at   timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (user_id, goal_id, entry_date)
);
create index daily_entries_date_idx on public.daily_entries (entry_date);

-- ---------------------------------------------------------------------------
-- Bonus challenges
-- ---------------------------------------------------------------------------
create table public.bonus_presets (
  id          uuid primary key default gen_random_uuid(),
  description text not null,
  sort_order  int  not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.bonus_challenges (
  id             uuid primary key default gen_random_uuid(),
  challenge_date date not null unique,
  description    text not null,
  point_value    int  not null default 7 check (point_value = 7),
  source         text not null default 'manual' check (source in ('manual', 'auto')),
  created_at     timestamptz not null default now()
);

create table public.bonus_completions (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.profiles (id) on delete cascade,
  bonus_challenge_id uuid not null references public.bonus_challenges (id) on delete cascade,
  completed          boolean not null,
  completed_at       timestamptz not null default now(),
  unique (user_id, bonus_challenge_id)
);

-- ---------------------------------------------------------------------------
-- Weekly scores (cached; recomputed on every check-in, finalized Monday)
-- ---------------------------------------------------------------------------
create table public.weekly_scores (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references public.profiles (id) on delete cascade,
  week_start_date       date not null check (extract(isodow from week_start_date) = 1),
  category_scores       jsonb not null default '{}',  -- {gym: {points, actual, target, pct, max, band}, ...}
  total_category_points numeric not null default 0,   -- max 1000
  bonus_points          int     not null default 0,   -- max 49
  total_points          numeric not null default 0,   -- max 1049
  band_per_category     jsonb not null default '{}',  -- {gym: "green", ...}
  consistency_rank      int,
  is_top_this_week      boolean not null default false,
  finalized             boolean not null default false,
  updated_at            timestamptz not null default now(),
  unique (user_id, week_start_date)
);
create index weekly_scores_week_idx on public.weekly_scores (week_start_date);

-- ---------------------------------------------------------------------------
-- Punishments & infractions
-- ---------------------------------------------------------------------------
create table public.punishment_library (
  id          uuid primary key default gen_random_uuid(),
  theme       public.goal_theme not null,
  description text not null,
  proof_type  public.proof_type not null default 'photo',
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.punishments (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references public.profiles (id) on delete cascade,
  category               public.goal_category not null,
  goal_id                uuid references public.goals (id) on delete set null,
  week_start_date        date not null,  -- the spec's week_id
  punishment_description text not null,
  proof_required         boolean not null default true,
  proof_type             public.proof_type not null,
  proof_submitted_at     timestamptz,
  proof_file_url         text,  -- storage path inside the private "proofs" bucket
  proof_note             text,
  proof_status           public.proof_status not null default 'pending',
  reviewed_by            uuid references public.profiles (id),
  reviewed_at            timestamptz,
  review_note            text,
  created_at             timestamptz not null default now(),
  unique (user_id, category, week_start_date)
);

create table public.infractions (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.profiles (id) on delete cascade,
  punishment_id      uuid not null unique references public.punishments (id) on delete cascade,
  infraction_number  int  not null check (infraction_number >= 1),
  resolution         public.infraction_resolution,  -- null = awaiting admin decision (2nd+)
  acknowledged_at    timestamptz,                    -- participant saw the notice
  resolved_at        timestamptz,
  created_at         timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Notification settings
-- ---------------------------------------------------------------------------
create table public.notification_settings (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null unique references public.profiles (id) on delete cascade,
  reminder_time     time not null default '21:00',
  timezone          text not null default 'UTC',
  push_subscription jsonb,
  enabled           boolean not null default false,
  last_notified_on  date,  -- local date of the last reminder sent (prevents duplicates)
  updated_at        timestamptz not null default now()
);

-- ============================================================================
-- Helpers used by policies
-- ============================================================================
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and status = 'active'
  );
$$;

-- ============================================================================
-- Row-level security
-- Participant writes to scoring tables go through SECURITY DEFINER functions
-- (see 0002) so the "today only" and ownership rules can't be bypassed.
-- ============================================================================
alter table public.profiles              enable row level security;
alter table public.invite_codes          enable row level security;
alter table public.goals                 enable row level security;
alter table public.daily_entries         enable row level security;
alter table public.bonus_presets         enable row level security;
alter table public.bonus_challenges      enable row level security;
alter table public.bonus_completions     enable row level security;
alter table public.weekly_scores         enable row level security;
alter table public.punishment_library    enable row level security;
alter table public.punishments           enable row level security;
alter table public.infractions           enable row level security;
alter table public.notification_settings enable row level security;

-- profiles: everyone signed in can see names (leaderboard); email is hidden
-- by column grants. Users may only edit their own display name / timezone.
revoke all on public.profiles from anon, authenticated;
grant select (id, username, display_name, role, status, timezone, activated_at, created_at)
  on public.profiles to authenticated;
grant update (display_name, timezone) on public.profiles to authenticated;
create policy profiles_read on public.profiles for select to authenticated using (true);
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- invite codes: admin only
create policy invites_admin on public.invite_codes for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- goals: private to owner + admin (refraining goals can be personal)
create policy goals_read on public.goals for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy entries_read on public.daily_entries for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy presets_read on public.bonus_presets for select to authenticated using (true);
create policy presets_admin on public.bonus_presets for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy challenges_read on public.bonus_challenges for select to authenticated using (true);
create policy challenges_admin on public.bonus_challenges for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy completions_read on public.bonus_completions for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- scores are the leaderboard: visible to the whole cohort
create policy scores_read on public.weekly_scores for select to authenticated using (true);

create policy library_read on public.punishment_library for select to authenticated using (true);
create policy library_admin on public.punishment_library for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy punishments_read on public.punishments for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy infractions_read on public.infractions for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy notif_read on public.notification_settings for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy notif_insert_self on public.notification_settings for insert to authenticated
  with check (user_id = auth.uid());
create policy notif_update_self on public.notification_settings for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
-- last_notified_on is the scheduler's bookkeeping; users can't touch it
revoke update on public.notification_settings from authenticated;
-- (user_id is included because PostgREST upserts SET every payload column;
-- the policy above still pins it to the caller.)
grant update (user_id, reminder_time, timezone, push_subscription, enabled, updated_at)
  on public.notification_settings to authenticated;

-- ============================================================================
-- Realtime (live leaderboard + admin check-in feed)
-- ============================================================================
-- (goals: so a waiting participant's screen flips the moment they're approved)
alter publication supabase_realtime add table
  public.weekly_scores, public.daily_entries, public.punishments, public.goals;

-- ============================================================================
-- Storage: private bucket for punishment proof. Files live at
-- proofs/<user_id>/<punishment_id>/<filename>
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('proofs', 'proofs', false)
on conflict (id) do nothing;

create policy proofs_upload_own on storage.objects for insert to authenticated
  with check (bucket_id = 'proofs' and (storage.foldername(name))[1] = auth.uid()::text);

create policy proofs_read_own_or_admin on storage.objects for select to authenticated
  using (bucket_id = 'proofs'
         and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
