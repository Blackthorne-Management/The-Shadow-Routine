import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, PROFILE_COLUMNS } from './supabase';
import type { Goal, NotificationSettings, Profile } from './types';
import { sortGoals } from './goals';

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  goals: Goal[];
  notif: NotificationSettings | null;
  loading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
  /** Signed in from a "forgot password" link and still needs to pick a new one */
  recovering: boolean;
  endRecovery: () => void;
}

// A reset link lands on /reset-password (and Supabase also fires PASSWORD_RECOVERY).
// Remembered for the tab so a reload doesn't skip the new-password step.
const RECOVERY_KEY = 'pw-recovery';
const startsInRecovery = () => {
  try {
    if (location.pathname === '/reset-password' || /type=recovery/.test(location.hash)) sessionStorage.setItem(RECOVERY_KEY, '1');
    return sessionStorage.getItem(RECOVERY_KEY) === '1';
  } catch { return location.pathname === '/reset-password'; }
};

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [notif, setNotif] = useState<NotificationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [recovering, setRecovering] = useState(startsInRecovery);

  const load = useCallback(async (s: Session | null) => {
    if (!s) {
      setProfile(null); setGoals([]); setNotif(null); setLoading(false);
      return;
    }
    const uid = s.user.id;
    const [p, g, n] = await Promise.all([
      supabase.from('profiles').select(PROFILE_COLUMNS).eq('id', uid).maybeSingle(),
      supabase.from('goals').select('*').eq('user_id', uid),
      supabase.from('notification_settings').select('*').eq('user_id', uid).maybeSingle(),
    ]);
    setProfile((p.data as Profile) ?? null);
    setGoals(sortGoals((g.data as Goal[]) ?? []));
    setNotif((n.data as NotificationSettings) ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      load(data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'PASSWORD_RECOVERY') {
        try { sessionStorage.setItem(RECOVERY_KEY, '1'); } catch { /* private mode */ }
        setRecovering(true);
      }
      // Token refreshes don't change who's signed in — skip the reload.
      if (event !== 'TOKEN_REFRESHED') load(s);
    });
    return () => sub.subscription.unsubscribe();
  }, [load]);

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    await load(data.session);
  }, [load]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const endRecovery = useCallback(() => {
    try { sessionStorage.removeItem(RECOVERY_KEY); } catch { /* private mode */ }
    setRecovering(false);
  }, []);

  return (
    <Ctx.Provider value={{ session, profile, goals, notif, loading, refresh, signOut, recovering, endRecovery }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}
