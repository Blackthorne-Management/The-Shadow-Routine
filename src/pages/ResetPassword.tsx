import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { supabase, friendlyError } from '../lib/supabase';
import { ErrorText, TopBar } from '../components/ui';

/**
 * Where a "forgot password" email link lands. The link signs you in; this asks
 * for the new password before letting you into the app.
 */
export default function ResetPassword() {
  const { session, endRecovery } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!session) {
    return (
      <main className="screen">
        <TopBar pill="Password" />
        <section className="card stack">
          <h1>This link has expired</h1>
          <p className="muted">Reset links work once and only for a while. Request a new one from the sign-in screen.</p>
          <Link to="/login" className="btn primary block">Back to sign in</Link>
        </section>
      </main>
    );
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (password.length < 8) return setError('Use at least 8 characters.');
    if (password !== confirm) return setError("Those passwords don't match.");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return setError(friendlyError(error));
    endRecovery();
    navigate('/', { replace: true });
  }

  return (
    <main className="screen">
      <TopBar pill="Password" />
      <form className="card stack" onSubmit={save}>
        <h1>Set a new password</h1>
        <p className="muted">Signed in as {session.user.email}. Choose a new password to finish.</p>
        <label className="field">
          <span>New password</span>
          <input type="password" autoComplete="new-password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <label className="field">
          <span>Type it again</span>
          <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </label>
        <ErrorText>{error}</ErrorText>
        <button className="btn primary block" disabled={busy || !password || !confirm}>{busy ? 'Saving…' : 'Save and continue'}</button>
      </form>
    </main>
  );
}
