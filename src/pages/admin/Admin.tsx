import { NavLink, Route, Routes } from 'react-router-dom';
import Overview from './Overview';
import Approvals from './Approvals';
import Invites from './Invites';
import Bonus from './Bonus';
import Library from './Library';
import Proofs from './Proofs';
import People from './People';

const TABS = [
  { to: '', label: 'Live' },
  { to: 'approvals', label: 'Approvals' },
  { to: 'proofs', label: 'Proof' },
  { to: 'people', label: 'People' },
  { to: 'invites', label: 'Invites' },
  { to: 'bonus', label: 'Bonus' },
  { to: 'library', label: 'Punishments' },
];

export default function Admin() {
  return (
    <main className="screen with-tabs admin">
      <header className="page-header">
        <div>
          <p className="eyebrow">Founder</p>
          <h1>Admin</h1>
        </div>
      </header>
      <nav className="subnav" aria-label="Admin sections">
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to ? `/admin/${t.to}` : '/admin'} end className={({ isActive }) => (isActive ? 'on' : '')}>{t.label}</NavLink>
        ))}
      </nav>
      <Routes>
        <Route index element={<Overview />} />
        <Route path="approvals" element={<Approvals />} />
        <Route path="proofs" element={<Proofs />} />
        <Route path="people" element={<People />} />
        <Route path="invites" element={<Invites />} />
        <Route path="bonus" element={<Bonus />} />
        <Route path="library" element={<Library />} />
      </Routes>
    </main>
  );
}
