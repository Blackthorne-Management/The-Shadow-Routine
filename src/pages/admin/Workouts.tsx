import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../lib/auth';
import { supabase, friendlyError } from '../../lib/supabase';
import { batched } from '../../lib/burst';
import { addDays, formatDay, localDate } from '../../lib/dates';
import type { Workout } from '../../lib/types';
import MediaThumb from '../../components/MediaThumb';
import { Empty, ErrorText } from '../../components/ui';

type Filter = 'exceptions' | 'photos' | 'rejected';

/** Mentor review: every workout's photo/clip, and "no photo" exception requests. */
export default function Workouts() {
  const { profile } = useAuth();
  const [filter, setFilter] = useState<Filter>('exceptions');
  const [items, setItems] = useState<Workout[] | null>(null);
  const [names, setNames] = useState<Map<string, string>>(new Map());

  const load = useCallback(async () => {
    const since = addDays(localDate(profile?.timezone ?? 'UTC'), -14);
    let q = supabase.from('workouts').select('*').order('entry_date', { ascending: false }).order('position');
    if (filter === 'exceptions') q = q.eq('status', 'exception_pending');
    if (filter === 'photos') q = q.not('media_path', 'is', null).neq('status', 'rejected').gte('entry_date', since).limit(60);
    if (filter === 'rejected') q = q.eq('status', 'rejected').limit(60);
    const [{ data }, { data: people }] = await Promise.all([q, supabase.from('profiles').select('id,display_name')]);
    setItems((data as Workout[]) ?? []);
    setNames(new Map((people ?? []).map((p) => [p.id, p.display_name])));
  }, [filter, profile]);

  useEffect(() => {
    load();
    const soon = batched(load);
    const ch = supabase.channel('admin-workouts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workouts' }, soon)
      .subscribe();
    return () => { soon.cancel(); supabase.removeChannel(ch); };
  }, [load]);

  return (
    <>
      <div className="seg">
        <button className={filter === 'exceptions' ? 'on' : ''} onClick={() => setFilter('exceptions')}>No-photo asks</button>
        <button className={filter === 'photos' ? 'on' : ''} onClick={() => setFilter('photos')}>Photos · 14 days</button>
        <button className={filter === 'rejected' ? 'on' : ''} onClick={() => setFilter('rejected')}>Rejected</button>
      </div>
      <p className="hint pad">
        Workouts with a photo count automatically. Reject one and it stops counting (the week is re-scored).
        No-photo workouts count only if you accept the explanation.
      </p>
      {!items ? <div className="skeleton-list" /> : items.length === 0 ? <Empty>Nothing here.</Empty> : (
        <ul className="list">
          {items.map((w) => <WorkoutCard key={w.id} w={w} name={names.get(w.user_id!) ?? '?'} onDone={load} />)}
        </ul>
      )}
    </>
  );
}

function WorkoutCard({ w, name, onDone }: { w: Workout; name: string; onDone: () => void }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function review(accept: boolean) {
    setBusy(true); setError('');
    const { error } = await supabase.rpc('review_workout', { p_id: w.id, p_accept: accept, p_note: note });
    setBusy(false);
    if (error) setError(friendlyError(error)); else { window.dispatchEvent(new Event('pending-changed')); onDone(); }
  }

  return (
    <li className="person">
      <div className="row gap">
        {w.media_path && <MediaThumb path={w.media_path} size={96} controls />}
        <div className="grow stack tight">
          <strong>{name}</strong>
          <span className="small muted">{formatDay(w.entry_date!)} · {w.workout_type} · {w.minutes} min</span>
          {w.exception_note && <span className="small">“{w.exception_note}”</span>}
          {w.review_note && <span className="small muted">Your note: {w.review_note}</span>}
        </div>
      </div>
      <input placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
      <ErrorText>{error}</ErrorText>
      <div className="row gap">
        {w.status !== 'rejected' && <button className="btn grow" onClick={() => review(false)} disabled={busy}>Reject</button>}
        {w.status !== 'approved' && w.status !== 'exception_accepted' && (
          <button className="btn primary grow" onClick={() => review(true)} disabled={busy}>
            {w.status === 'rejected' ? 'Restore' : 'Accept'}
          </button>
        )}
      </div>
    </li>
  );
}
