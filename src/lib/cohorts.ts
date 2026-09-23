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
