import { NavLink, Route, Routes } from 'react-router-dom';
import { TopBar } from '../../components/ui';
import Overview from './Overview';
import Approvals from './Approvals';
import Invites from './Invites';
import Bonus from './Bonus';
import Library from './Library';
import Proofs from './Proofs';
import People from './People';
import Workouts from './Workouts';
import Program from './Program';

const TABS = [
  { to: '', label: 'Live' },
  { to: 'approvals', label: 'Approvals' },
  { to: 'workouts', label: 'Workouts' },
  { to: 'proofs', label: 'Proof' },
  { to: 'people', label: 'People' },
  { to: 'invites', label: 'Invites' },
  { to: 'bonus', label: 'Bonus' },
  { to: 'program', label: 'Program' },
  { to: 'library', label: 'Fallbacks' },
];

export default function Admin() {
  return (
    <main className="screen with-tabs admin">
      <TopBar pill="Admin" />
      <nav className="subnav" aria-label="Admin sections">
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to ? `/admin/${t.to}` : '/admin'} end className={({ isActive }) => (isActive ? 'on' : '')}>{t.label}</NavLink>
        ))}
      </nav>
      <Routes>
        <Route index element={<Overview />} />
        <Route path="approvals" element={<Approvals />} />
        <Route path="workouts" element={<Workouts />} />
        <Route path="proofs" element={<Proofs />} />
        <Route path="program" element={<Program />} />
        <Route path="people" element={<People />} />
        <Route path="invites" element={<Invites />} />
        <Route path="bonus" element={<Bonus />} />
        <Route path="library" element={<Library />} />
      </Routes>
    </main>
  );
}
