import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import ReminderSettings from '../components/ReminderSettings';
import { PageHeader } from '../components/ui';

export default function Setup() {
  const navigate = useNavigate();
  const { notif } = useAuth();

  function skip() {
    try { localStorage.setItem('shadow.setupSkipped', '1'); } catch { /* private mode */ }
    navigate('/', { replace: true });
  }

  return (
    <main className="screen">
      <PageHeader subtitle="You're approved 🎉" title="Set your nightly reminder" />
      <p className="muted">
        Pick when you want the nudge to log your day. Most people choose an hour or two before bed.
      </p>
      <section className="card">
        <ReminderSettings />
      </section>
      {notif ? (
        <button className="btn primary block" onClick={() => navigate('/', { replace: true })}>Start</button>
      ) : (
        <button className="link center-text block" onClick={skip}>Skip for now</button>
      )}
    </main>
  );
}
