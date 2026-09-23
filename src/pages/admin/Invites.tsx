import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../lib/auth';
import { supabase, friendlyError } from '../../lib/supabase';
import { timeAgo } from '../../lib/dates';
import { Empty, ErrorText } from '../../components/ui';

interface Invite { id: string; code: string; role: 'participant' | 'mentor'; note: string | null; status: 'unused' | 'used'; used_by: string | null; created_at: string; used_at: string | null }

export default function Invites() {
  const { profile } = useAuth();
  const [invites, setInvites] = useState<Invite[] | null>(null);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [note, setNote] = useState('');
  const [role, setRole] = useState<'participant' | 'mentor'>('participant');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');

  const load = useCallback(async () => {
    const [{ data }, { data: people }] = await Promise.all([
      supabase.from('invite_codes').select('*').order('created_at', { ascending: false }),
      supabase.from('profiles').select('id,display_name'),
    ]);
    setInvites((data as Invite[]) ?? []);
    setNames(new Map((people ?? []).map((p) => [p.id, p.display_name])));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function generate() {
    setError('');
    if (role === 'mentor' && !confirm('A mentor link gives full mentor access: approvals, reviews, invites and moderation. Create it?')) return;
    const { error } = await supabase.from('invite_codes').insert({ note: note.trim() || null, created_by: profile!.id, role });
    if (error) setError(friendlyError(error)); else { setNote(''); load(); }
  }

  async function revoke(id: string) {
    if (!confirm('Delete this unused code?')) return;
    await supabase.from('invite_codes').delete().eq('id', id);
    load();
  }

  async function share(code: string, asMentor: boolean) {
    const url = `${location.origin}/join?code=${code}`;
    const text = asMentor
      ? `You're invited to be a mentor on The Shadow Routine. Join here: ${url} (code ${code})`
      : `You're invited to The Shadow Routine. Join here: ${url} (code ${code})`;
    try {
      if (navigator.share) await navigator.share({ text });
      else { await navigator.clipboard.writeText(text); setCopied(code); setTimeout(() => setCopied(''), 1500); }
    } catch { /* share sheet dismissed */ }
  }

  return (
    <>
      <section className="card stack">
        <h2>New invite code</h2>
        <div className="seg" role="radiogroup" aria-label="Invite as">
          <button className={role === 'participant' ? 'on' : ''} onClick={() => setRole('participant')}>Participant</button>
          <button className={role === 'mentor' ? 'on' : ''} onClick={() => setRole('mentor')}>Mentor</button>
        </div>
        {role === 'mentor' && <p className="hint">Mentors sign up with this link, skip goal approval, and get the same mentor tools you have.</p>}
        <div className="row gap">
          <input className="grow" placeholder="Who is it for? (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
          <button className="btn primary" onClick={generate}>Generate</button>
        </div>
        <ErrorText>{error}</ErrorText>
      </section>
      {!invites ? <div className="skeleton-list" /> : invites.length === 0 ? <Empty>No codes yet.</Empty> : (
        <ul className="list">
          {invites.map((i) => (
            <li key={i.id} className="list-row">
              <div className="grow">
                <code className="code">{i.code}</code>{i.role === 'mentor' && <> <span className="level">Mentor</span></>}
                <p className="small muted">
                  {i.note ? `${i.note} · ` : ''}
                  {i.status === 'used'
                    ? `used by ${names.get(i.used_by ?? '') ?? 'someone'} ${i.used_at ? timeAgo(i.used_at) : ''}`
                    : `created ${timeAgo(i.created_at)}`}
                </p>
              </div>
              {i.status === 'unused' ? (
                <>
                  <button className="btn small" onClick={() => share(i.code, i.role === 'mentor')}>{copied === i.code ? 'Copied' : 'Share'}</button>
                  <button className="icon-btn small" aria-label="Delete code" onClick={() => revoke(i.id)}>✕</button>
                </>
              ) : <span className="pill">Used</span>}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
