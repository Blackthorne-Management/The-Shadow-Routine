import { lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { hasRequiredGoals } from './lib/goals';
import { isConfigured } from './lib/supabase';
import TabBar from './components/TabBar';
import { Splash } from './components/ui';
import Login from './pages/Login';
import Removed from './pages/Removed';
import Home from './pages/Home';
import CheckIn from './pages/CheckIn';
// Sign-in, Today and the check-in load first; everything else is fetched the
// first time it's opened (smaller first download on a phone). Participants
// never download the admin dashboard.
const Join = lazy(() => import('./pages/Join'));
const ProposeGoals = lazy(() => import('./pages/ProposeGoals'));
const AwaitingApproval = lazy(() => import('./pages/AwaitingApproval'));
const Leaderboard = lazy(() => import('./pages/Leaderboard'));
const Settings = lazy(() => import('./pages/Settings'));
const Setup = lazy(() => import('./pages/Setup'));
const PunishmentPage = lazy(() => import('./pages/Punishment'));
const RankPath = lazy(() => import('./pages/RankPath'));
const Chat = lazy(() => import('./pages/Chat'));
const DirectMessagePage = lazy(() => import('./pages/DirectMessages'));
const Ultimate = lazy(() => import('./pages/Ultimate'));
const Notifications = lazy(() => import('./pages/Notifications'));
const Onboarding = lazy(() => import('./pages/Onboarding'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const Admin = lazy(() => import('./pages/admin/Admin'));

export default function App() {
  const { session, profile, goals, notif, loading, recovering } = useAuth();

  if (!isConfigured) return <NotConfigured />;
  if (loading) return <Splash />;

  if (!session) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/join" element={<Join />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  // Came in from a "forgot password" link: new password first
  if (recovering) return <ResetPassword />;

  if (!profile) return <Splash message="Setting up your account…" retry />;
  if (profile.status === 'removed') return <Removed />;

  if (profile.role === 'admin') {
    return (
      <>
        <Routes>
          <Route path="/admin/*" element={<Admin />} />
          {/* A mentor who joined the cohort checks in like everyone else */}
          <Route path="/my-goals" element={<ProposeGoals mentor />} />
          {profile.mentor_participates && hasRequiredGoals(goals) && <>
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
        <TabBar admin mentorToday={profile.mentor_participates && hasRequiredGoals(goals)} />
      </>
    );
  }

  // Accounts from before the rank system pick their path once
  if (!profile.sex) return <RankPath />;
  // Then the "how it works" intro, once per account (before goal setup for new signups)
  if (!profile.onboarded_at) return <Onboarding firstRun />;

  if (profile.status === 'pending_approval') {
    const proposed = hasRequiredGoals(goals);
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
