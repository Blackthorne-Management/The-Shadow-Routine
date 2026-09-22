import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { Icon } from './Icon';

/** Bell with the unread count; live via Realtime. Links to the inbox. */
export default function NotificationBell() {
  const { profile } = useAuth();
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    if (!profile) return;
    const { count } = await supabase.from('notifications').select('id', { count: 'exact', head: true })
      .eq('user_id', profile.id).is('read_at', null);
    setUnread(count ?? 0);
  }, [profile]);

  useEffect(() => {
    if (!profile) return;
    load();
    const ch = supabase.channel(`bell-${profile.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${profile.id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [profile, load]);

  if (!profile) return null;
  return (
    <Link to="/notifications" className="bell" aria-label={unread ? `${unread} unread notifications` : 'Notifications'}>
      <Icon name="bell" size={20} />
      {unread > 0 && <span className="bell-count">{unread > 9 ? '9+' : unread}</span>}
    </Link>
  );
}
