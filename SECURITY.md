# Security

## Reporting
Found a security problem? Email the Admin privately. Don't open a public issue.

## How the app is protected
- **Row-level security** on every table. Participants only see their own private data. Mentors only see the cohorts they mentor. Only Admins read direct messages. It's all enforced in Postgres (`supabase/migrations`), not just hidden in the UI.
- **Privileged actions** (approving, reviewing, scoring, invites, cohort management) go through `SECURITY DEFINER` functions that check the caller's role first.
- **Storage:** private buckets. Files live under the uploader's own folder, with a 50 MB limit, images and video only. Chat media is only readable by people who can see its message.
- **No secrets in the repo.** The browser only gets the Supabase URL, the publishable key and the VAPID public key. The service-role key, the VAPID private key and the cron secret live in Supabase (Edge Function secrets / Vault).
- **Security headers** in `netlify.toml`: a strict Content-Security-Policy (no inline scripts), HSTS, nosniff, no framing.
- **CI** runs the type-check, the database tests and the build on every push (`.github/workflows/ci.yml`). Dependabot flags vulnerable packages.
