import { NavLink, Route, Routes } from 'react-router-dom';
import { TopBar } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { isSuperAdmin } from '../../lib/roles';
import { usePendingCounts, type PendingCounts } from '../../lib/badges';
import Overview from './Overview';
import Approvals from './Approvals';
import Invites from './Invites';
import Bonus from './Bonus';
import Library from './Library';
import Proofs from './Proofs';
import People from './People';
import Workouts from './Workouts';
import Program from './Program';
import AdminDms, { AdminDmThread } from './AdminDms';

interface Tab { to: string; label: string; pending?: keyof PendingCounts; adminOnly?: boolean }
const TABS: Tab[] = [
  { to: '', label: 'Live' },
  { to: 'approvals', label: 'Approvals', pending: 'approvals' },
  { to: 'workouts', label: 'Workouts', pending: 'workouts' },
  { to: 'proofs', label: 'Proof', pending: 'proofs' },
  { to: 'people', label: 'People' },
  { to: 'invites', label: 'Invites' },
  { to: 'bonus', label: 'Bonus' },
  { to: 'program', label: 'Program', adminOnly: true },
  { to: 'dms', label: 'DMs', adminOnly: true },
  { to: 'library', label: 'Fallbacks' },
];

export default function Admin() {
  const { profile } = useAuth();
  const admin = isSuperAdmin(profile);
  const counts = usePendingCounts(true, profile?.id);
  return (
    <main className="screen with-tabs admin">
      <TopBar pill={admin ? 'Admin' : 'Mentor'} />
      <nav className="subnav" aria-label="Staff sections">
        {TABS.filter((t) => admin || !t.adminOnly).map((t) => {
          const n = t.pending && counts ? counts[t.pending] : 0;
          return (
            <NavLink key={t.to} to={t.to ? `/admin/${t.to}` : '/admin'} end={!t.to}
              className={({ isActive }) => `${isActive ? 'on' : ''} ${n ? 'has-pending' : ''}`}>
              {t.label}{n > 0 && <span className="count-badge" aria-label={`${n} waiting`}>{n}</span>}
            </NavLink>
          );
        })}
      </nav>
      <Routes>
        <Route index element={<Overview />} />
        <Route path="approvals" element={<Approvals />} />
        <Route path="workouts" element={<Workouts />} />
        <Route path="proofs" element={<Proofs />} />
        <Route path="people" element={<People />} />
        <Route path="invites" element={<Invites />} />
        <Route path="bonus" element={<Bonus />} />
        <Route path="library" element={<Library />} />
        {admin && <Route path="program" element={<Program />} />}
        {admin && <Route path="dms" element={<AdminDms />} />}
        {admin && <Route path="dms/:a/:b" element={<AdminDmThread />} />}
      </Routes>
    </main>
  );
}
