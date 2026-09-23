import { NavLink, useLocation } from 'react-router-dom';

export default function TabBar({ admin = false, mentorToday = false }: { admin?: boolean; mentorToday?: boolean }) {
  const { pathname } = useLocation();
  // The check-in wizard and first-run setup are full-screen
  if (pathname.startsWith('/checkin') || pathname.startsWith('/setup') || pathname.startsWith('/how-it-works')) return null;

  const tabs = [
    admin ? { to: '/admin', label: 'Admin' } : { to: '/', label: 'Today' },
    ...(mentorToday ? [{ to: '/today', label: 'Today' }] : []),
    { to: '/board', label: 'Board' },
    { to: '/chat', label: 'Chat' },
    { to: '/settings', label: 'Me' },
  ];

  return (
    <nav className="tabbar" aria-label="Main">
      <div className="tabbar-inner">
        {tabs.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.to === '/'} className={({ isActive }) => `tab ${isActive ? 'active' : ''}`}>
            {t.label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
