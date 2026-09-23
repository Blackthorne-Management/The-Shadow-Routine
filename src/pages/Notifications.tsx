import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { timeAgo } from '../lib/dates';
import type { AppNotification } from '../lib/types';
import { Empty, TopBar } from '../components/ui';

/** The in-app inbox. Opening it marks everything as read. */
export default function Notifications() {
  const { profile } = useAuth();
  const [items, setItems] = useState<AppNotification[] | null>(null);

  useEffect(() => {
    if (!profile) return;
    supabase.from('notifications').select('*').eq('user_id', profile.id)
      .order('created_at', { ascending: false }).limit(100)
      .then(({ data }) => {
        setItems((data as AppNotification[]) ?? []);
        // Mark read after showing which ones were new
        supabase.rpc('mark_notifications_read', { p_ids: null })
          .then(() => window.dispatchEvent(new Event('notifications-read')));
      });
  }, [profile]);

  return (
    <main className="screen with-tabs">
      <TopBar pill="Notifications" />
      <p className="hint pad">Choose which ones you get in <Link to="/settings" className="link">Me → Notifications</Link>.</p>
      {!items ? <div className="skeleton-list" /> : items.length === 0 ? <Empty>Nothing yet.</Empty> : (
        <ul className="list">
          {items.map((n) => (
            <li key={n.id}>
              <Link to={n.url} className={`list-row link-row notif ${n.read_at ? '' : 'unread'}`}>
                {!n.read_at && <span className="status-dot new" aria-label="New" />}
                <div className="grow">
                  <strong style={{ fontWeight: 500 }}>{n.title}</strong>
                  {n.body && <p className="small muted">{n.body}</p>}
                </div>
                <span className="small muted">{timeAgo(n.created_at)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
