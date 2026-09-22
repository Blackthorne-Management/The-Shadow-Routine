import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { supabase, friendlyError } from '../lib/supabase';
import { ErrorText } from '../components/ui';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setError(friendlyError(error));
  }

  async function forgot() {
    if (!email.trim()) { setError('Enter your email first.'); return; }
    setError('');
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${location.origin}/settings`,
    });
    if (error) setError(friendlyError(error));
    else setInfo('Check your email for a reset link.');
  }

  return (
    <main className="screen auth">
      <div className="brand">
        <img src="/icons/icon.svg" alt="" width={64} height={64} />
        <h1>The Shadow Routine</h1>
        <p className="muted">Most consistent wins.</p>
      </div>
      <form onSubmit={submit} className="stack">
        <label className="field">
          <span>Email</span>
          <input type="email" autoComplete="email" inputMode="email" value={email}
                 onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className="field">
          <span>Password</span>
          <input type="password" autoComplete="current-password" value={password}
                 onChange={(e) => setPassword(e.target.value)} required />
        </label>
        <ErrorText>{error}</ErrorText>
        {info && <p className="success">{info}</p>}
        <button className="btn primary block" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <button type="button" className="link" onClick={forgot}>Forgot password?</button>
      </form>
      <p className="muted center-text">
        Have an invite code? <Link to="/join">Join the cohort</Link>
      </p>
    </main>
  );
}
