import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from './supabase';

// Several components use these hooks at once; each needs its own Realtime channel
let seq = 0;

export interface PendingCounts { approvals: number; workouts: number; proofs: number }

/**
 * What's waiting for staff in each admin section. Refreshed on every page change
 * and whenever a new notification arrives (new items notify staff).
 */
export function usePendingCounts(enabled: boolean, userId: string | undefined): PendingCounts | null {
  const [counts, setCounts] = useState<PendingCounts | null>(null);
  const { pathname } = useLocation();
  useEffect(() => {
    if (!enabled || !userId) return;
    let live = true;
    const load = () => supabase.rpc('admin_pending_counts').then(({ data }) => { if (live && data) setCounts(data as PendingCounts); });
    load();
    const ch = supabase.channel(`pending-${userId}-${++seq}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, load)
      .subscribe();
    const t = setInterval(load, 60_000);
    window.addEventListener('pending-changed', load);
    return () => { live = false; clearInterval(t); window.removeEventListener('pending-changed', load); supabase.removeChannel(ch); };
  }, [enabled, userId, pathname]);
  return counts;
}

export const pendingTotal = (c: PendingCounts | null) => (c ? c.approvals + c.workouts + c.proofs : 0);

/** Unread direct messages, for the Chat tab badge. */
export function useDmUnread(userId: string | undefined): number {
  const [n, setN] = useState(0);
  const { pathname, search } = useLocation();
  useEffect(() => {
    if (!userId) return;
    let live = true;
    const load = () => supabase.rpc('my_dm_threads').then(({ data }) => {
      if (live) setN(((data as { unread: number }[]) ?? []).reduce((a, t) => a + t.unread, 0));
    });
    load();
    const ch = supabase.channel(`dm-unread-${userId}-${++seq}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `recipient_id=eq.${userId}` }, () => setTimeout(load, 300))
      .subscribe();
    window.addEventListener('dm-read', load);
    return () => { live = false; window.removeEventListener('dm-read', load); supabase.removeChannel(ch); };
  }, [userId, pathname, search]);
  return n;
}
