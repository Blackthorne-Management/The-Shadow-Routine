import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { supabase, friendlyError } from '../lib/supabase';
import { ErrorText, TopBar } from '../components/ui';

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
    <main className="screen">
      <div className="linked">
        <TopBar pill="Pilot" />
        <section className="card auth-hero">
        <h1>Most consistent<br />wins.</h1>
        <div className="row" style={{ gap: 48 }}>
          <div><p className="eyebrow">Program</p><p>The Shadow Routine</p></div>
          <div><p className="eyebrow">Goals</p><p>5 daily</p></div>
        </div>
        </section>
      </div>
      <form onSubmit={submit} className="stack auth-form">
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
        <button type="button" className="link muted" onClick={forgot}>Forgot password?</button>
      </form>
      <Link to="/join" className="btn block">I have an invite code</Link>
    </main>
  );
}
