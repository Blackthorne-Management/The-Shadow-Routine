import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { isSuperAdmin } from '../lib/roles';
import { pendingTotal, useDmUnread, usePendingCounts } from '../lib/badges';

export default function TabBar({ admin = false, mentorToday = false }: { admin?: boolean; mentorToday?: boolean }) {
  const { pathname } = useLocation();
  const { profile } = useAuth();
  const pending = pendingTotal(usePendingCounts(admin, profile?.id));
  const unread = useDmUnread(profile?.id);
  // The check-in wizard and first-run setup are full-screen
  if (pathname.startsWith('/checkin') || pathname.startsWith('/setup') || pathname.startsWith('/how-it-works')) return null;

  const tabs = [
    admin ? { to: '/admin', label: isSuperAdmin(profile) ? 'Admin' : 'Mentor', badge: pending } : { to: '/', label: 'Today', badge: 0 },
    ...(mentorToday ? [{ to: '/today', label: 'Today', badge: 0 }] : []),
    { to: '/board', label: 'Board', badge: 0 },
    { to: '/chat', label: 'Chat', badge: unread },
    { to: '/settings', label: 'Me', badge: 0 },
  ];

  return (
    <nav className="tabbar" aria-label="Main">
      <div className="tabbar-inner">
        {tabs.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.to === '/'} className={({ isActive }) => `tab ${isActive ? 'active' : ''}`}>
            {t.label}
            {t.badge > 0 && <span className="tab-badge" aria-label={`${t.badge} waiting`}>{t.badge > 9 ? '9+' : t.badge}</span>}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
