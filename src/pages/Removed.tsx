import { useAuth } from '../lib/auth';

export default function Removed() {
  const { signOut } = useAuth();
  return (
    <main className="screen center">
      <h1>You've been removed from this cohort</h1>
      <p className="muted">Reach out to your mentor if you have questions.</p>
      <button className="btn" onClick={signOut}>Sign out</button>
    </main>
  );
}
