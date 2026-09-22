import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase, friendlyError } from '../lib/supabase';
import { browserTimezone } from '../lib/dates';
import { ErrorText, TopBar } from '../components/ui';
import { SexPicker } from './RankPath';
import type { Sex } from '../lib/types';

export default function Join() {
  const [params] = useSearchParams();
  const [code, setCode] = useState(params.get('code') ?? '');
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [sex, setSex] = useState<Sex | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    const uname = username.trim().toLowerCase();
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (!sex) { setError('Pick male or female. It only sets which rank titles you see.'); return; }
    setBusy(true);

    // Pre-flight so we can show a clear message (the signup trigger enforces this anyway)
    const { data: check, error: checkErr } = await supabase.rpc('check_signup', { p_code: code, p_username: uname });
    if (checkErr) { setBusy(false); setError(friendlyError(checkErr)); return; }
    if (check !== 'ok') {
      setBusy(false);
      setError({
        invalid_code: 'That invite code is invalid or already used.',
        username_taken: 'That username is taken.',
        bad_username: 'Usernames are 3–24 characters: letters, numbers, underscores.',
      }[check as string] ?? 'Something is off — try again.');
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          invite_code: code.trim().toUpperCase(),
          username: uname,
          display_name: displayName.trim(),
          timezone: browserTimezone(),
          sex,
        },
        emailRedirectTo: location.origin,
      },
    });
    setBusy(false);
    if (error) { setError(friendlyError(error)); return; }
    // If "Confirm email" is on in Supabase there's no session yet.
    if (!data.session) setCheckEmail(true);
  }

  if (checkEmail) {
    return (
      <main className="screen">
        <TopBar pill="Almost in" />
        <section className="card auth-hero">
          <h1>Check your<br />email.</h1>
          <p className="muted">Confirm your address, then come back and sign in.</p>
        </section>
        <Link to="/login" className="btn primary block">Go to sign in</Link>
      </main>
    );
  }

  return (
    <main className="screen">
      <TopBar pill="Invite only" />
      <section className="card auth-hero">
        <h1>Join the<br />cohort.</h1>
        <p className="muted">You'll need the invite code your mentor sent you.</p>
      </section>
      <form onSubmit={submit} className="stack auth-form">
        <label className="field">
          <span>Invite code</span>
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())}
                 autoCapitalize="characters" autoComplete="off" placeholder="SHDW-XXXXXX" required />
        </label>
        <label className="field">
          <span>Your name</span>
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)}
                 autoComplete="name" maxLength={40} placeholder="Shown on the leaderboard" required />
        </label>
        <label className="field">
          <span>Username</span>
          <input value={username} onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                 autoCapitalize="none" autoComplete="username" maxLength={24} required />
        </label>
        <label className="field">
          <span>Email</span>
          <input type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)}
                 autoComplete="email" required />
        </label>
        <label className="field">
          <span>Password</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                 autoComplete="new-password" minLength={8} required />
        </label>
        <div className="field">
          <span>Sex (sets your rank titles, nothing else)</span>
          <SexPicker value={sex} onChange={setSex} />
        </div>
        <ErrorText>{error}</ErrorText>
        <button className="btn primary block" disabled={busy}>{busy ? 'Creating account…' : 'Create account'}</button>
      </form>
      <p className="muted center-text">Already joined? <Link to="/login" className="link">Sign in</Link></p>
    </main>
  );
}
