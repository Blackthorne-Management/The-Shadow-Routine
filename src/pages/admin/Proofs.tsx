import { useCallback, useEffect, useState } from 'react';
import { supabase, friendlyError } from '../../lib/supabase';
import { batched } from '../../lib/burst';
import { formatWeek, timeAgo } from '../../lib/dates';
import { CATEGORY_NAMES } from '../../lib/goals';
import type { Punishment } from '../../lib/types';
import ProofPreview from '../../components/ProofPreview';
import { Empty, ErrorText } from '../../components/ui';

type Filter = 'review' | 'awaiting' | 'done';

export default function Proofs() {
  const [filter, setFilter] = useState<Filter>('review');
  const [items, setItems] = useState<Punishment[] | null>(null);
  const [names, setNames] = useState<Map<string, string>>(new Map());

  const load = useCallback(async () => {
    let q = supabase.from('punishments').select('*').order('created_at', { ascending: false });
    if (filter === 'review') q = q.eq('proof_status', 'pending').not('proof_submitted_at', 'is', null);
    if (filter === 'awaiting') q = q.eq('proof_status', 'pending').is('proof_submitted_at', null);
    if (filter === 'done') q = q.neq('proof_status', 'pending').limit(50);
    const [{ data }, { data: people }] = await Promise.all([q, supabase.from('profiles').select('id,display_name')]);
    setItems((data as Punishment[]) ?? []);
    setNames(new Map((people ?? []).map((p) => [p.id, p.display_name])));
  }, [filter]);

  useEffect(() => {
    load();
    const soon = batched(load);
    const ch = supabase.channel('admin-proofs')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'punishments' }, soon)
      .subscribe();
    return () => { soon.cancel(); supabase.removeChannel(ch); };
  }, [load]);

  return (
    <>
      <div className="seg">
        <button className={filter === 'review' ? 'on' : ''} onClick={() => setFilter('review')}>Needs review</button>
        <button className={filter === 'awaiting' ? 'on' : ''} onClick={() => setFilter('awaiting')}>Awaiting proof</button>
        <button className={filter === 'done' ? 'on' : ''} onClick={() => setFilter('done')}>Reviewed</button>
      </div>
      {!items ? <div className="skeleton-list" /> : items.length === 0 ? <Empty>Nothing here.</Empty> : (
        items.map((p) => <ProofCard key={p.id} p={p} name={names.get(p.user_id) ?? '?'} onDone={load} />)
      )}
    </>
  );
}

function ProofCard({ p, name, onDone }: { p: Punishment; name: string; onDone: () => void }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function review(accept: boolean) {
    if (!accept && !confirm(`Reject and log an infraction for ${name}?`)) return;
    setBusy(true); setError('');
    const { error } = await supabase.rpc('review_proof', { p_punishment: p.id, p_accept: accept, p_note: note });
    setBusy(false);
    if (error) setError(friendlyError(error)); else { window.dispatchEvent(new Event('pending-changed')); onDone(); }
  }

  const reviewable = p.proof_status === 'pending';
  return (
    <section className="card stack">
      <div className="row between">
        <div>
          <h2>{name}</h2>
          <p className="small muted">{p.kind === 'ultra' ? 'Ultra Punishment (Ultra Red Month)' : `Red week · ${CATEGORY_NAMES[p.category!]}`} · week of {formatWeek(p.week_start_date)}</p>
        </div>
        <span className={`pill ${p.proof_status === 'accepted' ? 'green' : p.proof_status === 'rejected' ? 'red' : 'amber'}`}>
          {p.proof_status}
        </span>
      </div>
      <p><strong>{p.punishment_description}</strong></p>
      {p.proof_type === 'mentor_conversation' && p.proof_submitted_at && (
        <p className="notice">Says they discussed it with you {timeAgo(p.proof_submitted_at)}. Confirm or dispute.</p>
      )}
      {p.proof_file_url && <ProofPreview path={p.proof_file_url} />}
      {p.proof_note && <p className="muted">“{p.proof_note}”</p>}
      {!p.proof_submitted_at && <p className="hint">No proof submitted yet. Rejecting marks it missing and logs an infraction.</p>}
      {p.review_note && <p className="small muted">Your note: {p.review_note}</p>}
      {reviewable && (
        <>
          <input placeholder="Note to participant (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
          <ErrorText>{error}</ErrorText>
          <div className="row gap">
            <button className="btn grow" onClick={() => review(false)} disabled={busy}>
              {p.proof_submitted_at ? 'Reject' : 'Mark missing'}
            </button>
            {p.proof_submitted_at && (
              <button className="btn primary grow" onClick={() => review(true)} disabled={busy}>Accept</button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
