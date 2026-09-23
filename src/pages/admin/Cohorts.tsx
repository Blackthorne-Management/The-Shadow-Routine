import { useEffect, useState } from 'react';
import { useAuth } from '../../lib/auth';
import { supabase, friendlyError } from '../../lib/supabase';
import { COHORT_NAMES, useCohorts } from '../../lib/cohorts';
import { staffLabel } from '../../lib/roles';
import { Empty, ErrorText } from '../../components/ui';

interface Member { id: string; display_name: string; role: string; is_super_admin: boolean; is_mentor: boolean; status: string; cohort_id: string | null }

/** Admin only: every cohort, its members and mentors; create, rename, assign mentors. */
export default function Cohorts() {
  const { profile, refresh } = useAuth();
  const { cohorts, load, mentorsOf } = useCohorts();
  const [people, setPeople] = useState<Member[]>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const loadPeople = () => supabase.from('profiles').select('id,display_name,role,is_super_admin,is_mentor,status,cohort_id')
    .then(({ data }) => setPeople((data as Member[]) ?? []));
  useEffect(() => { loadPeople(); }, []);

  const taken = new Set((cohorts ?? []).map((c) => c.name.toLowerCase()));
  const suggestion = COHORT_NAMES.find((n) => !taken.has(n.toLowerCase())) ?? '';
  const staff = people.filter((p) => p.role === 'admin' && p.status === 'active');

  async function run(p: PromiseLike<{ error: unknown }>) {
    setError('');
    const { error } = await p;
    if (error) { setError(friendlyError(error)); return false; }
    await load(); refresh();
    return true;
  }

  async function create() {
    const n = (name || suggestion).trim();
    if (n && await run(supabase.rpc('create_cohort', { p_name: n }))) setName('');
  }

  async function rename(id: string, current: string) {
    const n = prompt('New cohort name', current)?.trim();
    if (n && n !== current) run(supabase.rpc('rename_cohort', { p_cohort: id, p_name: n }));
  }

  return (
    <>
      <section className="card stack">
        <h2>New cohort</h2>
        <div className="row gap">
          <input className="grow" placeholder={suggestion || 'Cohort name'} value={name} onChange={(e) => setName(e.target.value)} />
          <button className="btn primary" onClick={create}>Create</button>
        </div>
        <p className="hint">Leave it blank to use the next name: {suggestion || '(pick your own)'}. Invite people into a cohort from Invites.</p>
      </section>
      <ErrorText>{error}</ErrorText>

      {!cohorts ? <div className="skeleton-list" /> : cohorts.length === 0 ? <Empty>No cohorts yet.</Empty> : cohorts.map((c) => {
        const members = people.filter((p) => p.cohort_id === c.id && p.role === 'participant' && p.status !== 'removed');
        const mentors = mentorsOf(c.id);
        const iMentor = !!profile && mentors.includes(profile.id);
        return (
          <section key={c.id} className="card stack">
            <div className="row between">
              <h2>{c.name}</h2>
              <button className="link small" onClick={() => rename(c.id, c.name)}>Rename</button>
            </div>
            <p className="small muted">{members.length} participant{members.length === 1 ? '' : 's'}{members.length ? `: ${members.map((m) => m.display_name).join(', ')}` : ''}</p>

            <label className="pref-row">
              <div className="grow"><span>I mentor {c.name}</span>
                <p className="small muted">You get its approvals, reviews and proof alerts.</p></div>
              <input type="checkbox" role="switch" className="switch" checked={iMentor}
                onChange={(e) => run(supabase.rpc('set_cohort_mentor', { p_cohort: c.id, p_user: profile!.id, p_on: e.target.checked }))} />
            </label>

            <div className="stack tight">
              <span className="small muted">Mentors</span>
              {mentors.length === 0 && <p className="small">None yet. Its alerts go to the Admins.</p>}
              <div className="chips">
                {mentors.map((id) => {
                  const m = people.find((p) => p.id === id);
                  return (
                    <span key={id} className="chip">
                      {m?.display_name ?? '…'} <span className="small muted">{staffLabel(m)}</span>
                      <button className="link small" aria-label={`Remove ${m?.display_name} as mentor`}
                        onClick={() => run(supabase.rpc('set_cohort_mentor', { p_cohort: c.id, p_user: id, p_on: false }))}>✕</button>
                    </span>
                  );
                })}
              </div>
              {staff.some((s) => !mentors.includes(s.id)) && (
                <select value="" onChange={(e) => e.target.value && run(supabase.rpc('set_cohort_mentor', { p_cohort: c.id, p_user: e.target.value, p_on: true }))}>
                  <option value="">Add a mentor…</option>
                  {staff.filter((s) => !mentors.includes(s.id)).map((s) => (
                    <option key={s.id} value={s.id}>{s.display_name} ({staffLabel(s)})</option>
                  ))}
                </select>
              )}
            </div>
          </section>
        );
      })}
    </>
  );
}
