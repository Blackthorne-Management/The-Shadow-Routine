import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { supabase, friendlyError } from '../lib/supabase';
import { formatWeek } from '../lib/dates';
import type { Punishment } from '../lib/types';
import { ErrorText, Splash } from '../components/ui';
import ProofPreview from '../components/ProofPreview';
import { Icon } from '../components/Icon';

const MAX_MB = 50; // Supabase free-tier per-file limit

export default function PunishmentPage() {
  const { id } = useParams();
  const { profile, goals } = useAuth();
  const [p, setP] = useState<Punishment | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = () => supabase.from('punishments').select('*').eq('id', id!).maybeSingle()
    .then(({ data }) => setP(data as Punishment));
  useEffect(() => { load(); }, [id]);

  if (!p || !profile) return <Splash />;
  const goal = goals.find((g) => g.category === p.category);
  const mentor = p.proof_type === 'mentor_conversation';
  const canSubmit = p.proof_status !== 'accepted';

  async function submit() {
    setError('');
    let path: string | null = null;
    if (!mentor) {
      if (!file) return setError(`Choose a ${p!.proof_type} to upload.`);
      if (file.size > MAX_MB * 1024 * 1024) return setError(`Files must be under ${MAX_MB} MB.`);
      setBusy(true);
      const safe = file.name.replace(/[^\w.-]+/g, '_').slice(-60);
      path = `${profile!.id}/${p!.id}/${Date.now()}-${safe}`;
      const { error: upErr } = await supabase.storage.from('proofs').upload(path, file, { contentType: file.type });
      if (upErr) { setBusy(false); return setError(friendlyError(upErr)); }
    }
    setBusy(true);
    const { error } = await supabase.rpc('submit_proof', { p_punishment: p!.id, p_path: path, p_note: note });
    setBusy(false);
    if (error) return setError(friendlyError(error));
    setFile(null); setNote('');
    load();
  }

  return (
    <main className="screen with-tabs">
      <Link to="/" className="back-link"><Icon name="back" size={16} /> Today</Link>
      <section className="card">
        <span className="pill red" style={{ alignSelf: 'flex-start' }}>Red band</span>
        <p className="eyebrow">{goal?.label ?? p.category} · {formatWeek(p.week_start_date)}</p>
        <h1>{p.punishment_description}</h1>
      </section>

      <div className={`notice ${p.proof_status === 'rejected' ? 'red' : p.proof_status === 'accepted' ? 'green' : ''}`}>
        {p.proof_status === 'accepted' && <strong>Proof accepted. You're clear.</strong>}
        {p.proof_status === 'rejected' && <strong>Proof rejected{p.review_note ? `: ${p.review_note}` : ''}</strong>}
        {p.proof_status === 'pending' && (p.proof_submitted_at
          ? <strong>Submitted — waiting on your mentor's review.</strong>
          : <strong>{mentor ? 'Complete it, then confirm you discussed it with your mentor.' : `Complete it and upload a ${p.proof_type} as proof.`}</strong>)}
      </div>

      {p.proof_file_url && <ProofPreview path={p.proof_file_url} />}
      {p.proof_note && <p className="muted">Your note: {p.proof_note}</p>}

      {canSubmit && (
        <section className="card stack">
          <h2>{p.proof_submitted_at ? 'Resubmit proof' : 'Submit proof'}</h2>
          {!mentor && (
            <label className="file-drop">
              <input type="file" accept={p.proof_type === 'video' ? 'video/*' : 'image/*,video/*'}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              <Icon name={p.proof_type === 'video' ? 'video' : 'camera'} /><span>{file ? file.name : p.proof_type === 'video' ? 'Record or choose a video' : 'Take or choose a photo'}</span>
            </label>
          )}
          <label className="field">
            <span>{mentor ? 'How did the conversation go?' : 'Note (optional)'}</span>
            <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <ErrorText>{error}</ErrorText>
          <button className="btn primary block" onClick={submit} disabled={busy}>
            {busy ? 'Uploading…' : mentor ? "I've discussed this with my mentor" : 'Submit proof'}
          </button>
        </section>
      )}
    </main>
  );
}
