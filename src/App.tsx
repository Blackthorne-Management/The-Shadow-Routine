import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { isConfigured } from './lib/supabase';
import TabBar from './components/TabBar';
import { Splash } from './components/ui';
import Login from './pages/Login';
import Join from './pages/Join';
import ProposeGoals from './pages/ProposeGoals';
import AwaitingApproval from './pages/AwaitingApproval';
import Removed from './pages/Removed';
import Home from './pages/Home';
import CheckIn from './pages/CheckIn';
import Leaderboard from './pages/Leaderboard';
import Settings from './pages/Settings';
import Setup from './pages/Setup';
import PunishmentPage from './pages/Punishment';
import RankPath from './pages/RankPath';
import Chat from './pages/Chat';
import DirectMessagePage from './pages/DirectMessages';
import Ultimate from './pages/Ultimate';
import Notifications from './pages/Notifications';
import Onboarding from './pages/Onboarding';
// Participants never download the admin dashboard
const Admin = lazy(() => import('./pages/admin/Admin'));

export default function App() {
  const { session, profile, goals, notif, loading } = useAuth();

  if (!isConfigured) return <NotConfigured />;
  if (loading) return <Splash />;

  if (!session) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/join" element={<Join />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  if (!profile) return <Splash message="Setting up your account…" retry />;
  if (profile.status === 'removed') return <Removed />;

  if (profile.role === 'admin') {
    return (
      <>
        <Routes>
          <Route path="/admin/*" element={<Suspense fallback={<Splash />}><Admin /></Suspense>} />
          {/* A mentor who joined the cohort checks in like everyone else */}
          <Route path="/my-goals" element={<ProposeGoals mentor />} />
          {profile.mentor_participates && goals.length === 5 && <>
            <Route path="/today" element={<Home />} />
            <Route path="/checkin" element={<CheckIn />} />
          </>}
          <Route path="/board" element={<Leaderboard />} />
          <Route path="/ultimate" element={<Ultimate />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/chat/dm/:id" element={<DirectMessagePage />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/how-it-works" element={<Onboarding />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
        <TabBar admin mentorToday={profile.mentor_participates && goals.length === 5} />
      </>
    );
  }

  // Accounts from before the rank system pick their path once
  if (!profile.sex) return <RankPath />;
  // Then the "how it works" intro, once per account (before goal setup for new signups)
  if (!profile.onboarded_at) return <Onboarding firstRun />;

  if (profile.status === 'pending_approval') {
    const proposed = goals.length === 5;
    return (
      <Routes>
        <Route path="/goals" element={<ProposeGoals />} />
        <Route path="/waiting" element={proposed ? <AwaitingApproval /> : <Navigate to="/goals" replace />} />
        <Route path="*" element={<Navigate to={proposed ? '/waiting' : '/goals'} replace />} />
      </Routes>
    );
  }

  // Active participant. First time in: set up reminders (skippable).
  const needsSetup = !notif && !skippedSetup();
  return (
    <>
      <Routes>
        <Route path="/setup" element={<Setup />} />
        <Route path="/" element={needsSetup ? <Navigate to="/setup" replace /> : <Home />} />
        <Route path="/checkin" element={<CheckIn />} />
        <Route path="/board" element={<Leaderboard />} />
          <Route path="/ultimate" element={<Ultimate />} />
        <Route path="/chat" element={<Chat />} />
          <Route path="/chat/dm/:id" element={<DirectMessagePage />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/how-it-works" element={<Onboarding />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/punishment/:id" element={<PunishmentPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <TabBar />
    </>
  );
}

export function skippedSetup() {
  try { return localStorage.getItem('shadow.setupSkipped') === '1'; } catch { return false; }
}

function NotConfigured() {
  return (
    <main className="screen center">
      <h1>Almost there</h1>
      <p className="muted">
        Supabase isn't configured. Copy <code>.env.example</code> to <code>.env</code>, fill in your
        project URL and anon key, then restart the dev server (or set them in Netlify's environment variables).
      </p>
    </main>
  );
}
