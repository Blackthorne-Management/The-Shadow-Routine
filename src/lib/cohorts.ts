import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';

export interface Cohort { id: string; name: string; created_at: string }
export interface CohortMentor { cohort_id: string; user_id: string }

/** Suggested names for new cohorts: old Japanese spiritual names. */
export const COHORT_NAMES = [
  'Marishiten', 'Fudō', 'Hachiman', 'Bishamonten', 'Raijin', 'Fūjin', 'Susanoo',
  'Tsukuyomi', 'Amaterasu', 'Takemikazuchi', 'Ryūjin', 'Kagutsuchi', 'Izanagi', 'Izanami',
];

/** Every cohort and who mentors each (readable by everyone signed in). */
export function useCohorts() {
  const [cohorts, setCohorts] = useState<Cohort[] | null>(null);
  const [links, setLinks] = useState<CohortMentor[]>([]);
  const load = useCallback(async () => {
    const [c, m] = await Promise.all([
      supabase.from('cohorts').select('id,name,created_at').order('created_at'),
      supabase.from('cohort_mentors').select('cohort_id,user_id'),
    ]);
    setCohorts((c.data as Cohort[]) ?? []);
    setLinks((m.data as CohortMentor[]) ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);
  const mentoredBy = (userId: string | undefined) => links.filter((l) => l.user_id === userId).map((l) => l.cohort_id);
  const mentorsOf = (cohortId: string) => links.filter((l) => l.cohort_id === cohortId).map((l) => l.user_id);
  return { cohorts, links, load, mentoredBy, mentorsOf };
}

/**
 * The cohorts this person can look at: their own; for staff, also every cohort
 * they mentor (Admins: all). `pick`/`setPick` switch between them.
 */
export function useViewCohorts(profile: { id: string; role: string; is_super_admin?: boolean; cohort_id: string | null } | null) {
  const { cohorts, mentoredBy } = useCohorts();
  const staff = profile?.role === 'admin';
  const choices = (cohorts ?? []).filter((c) =>
    c.id === profile?.cohort_id || (staff && (profile?.is_super_admin || mentoredBy(profile?.id).includes(c.id))));
  const [pick, setPick] = useState<string | null>(null);
  const current = pick ?? profile?.cohort_id ?? choices[0]?.id ?? null;
  const names = new Map((cohorts ?? []).map((c) => [c.id, c.name]));
  return { cohorts, choices, current, setPick, name: current ? names.get(current) ?? null : null, names };
}
