import { useCallback, useEffect, useState } from 'react';
import { supabase, friendlyError } from '../../lib/supabase';
import { THEME_ICONS, THEME_NAMES, sortGoals } from '../../lib/goals';
import type { Goal, Profile } from '../../lib/types';
import { Empty, ErrorText } from '../../components/ui';

interface Person { profile: Profile; goals: Goal[] }

export default function Approvals() {
  const [showActive, setShowActive] = useState(false);
  const [people, setPeople] = useState<Person[] | null>(null);

  const load = useCallback(async () => {
    const statuses = showActive ? ['pending_approval', 'active'] : ['pending_approval'];
    const { data: profiles } = await supabase.from('profiles')
      .select('id,username,display_name,role,status,timezone,activated_at,created_at')
      .eq('role', 'participant').in('status', statuses).order('created_at');
    const ids = (profiles ?? []).map((p) => p.id);
    const { data: goals } = ids.length
      ? await supabase.from('goals').select('*').in('user_id', ids)
      : { data: [] as Goal[] };
    setPeople((profiles as Profile[] ?? []).map((p) => ({
      profile: p,
      goals: sortGoals((goals as Goal[]).filter((g) => g.user_id === p.id)),
    })));
  }, [showActive]);

  useEffect(() => { load(); }, [load]);

  if (!people) return <div className="skeleton-list" />;
  const pending = people.filter((p) => p.profile.status === 'pending_approval');

  return (
    <>
      <label className="toggle-row">
        <input type="checkbox" checked={showActive} onChange={(e) => setShowActive(e.target.checked)} />
        Also show active participants (to adjust their goals)
      </label>
      {pending.length === 0 && !showActive && <Empty>No goal submissions waiting. 🎉</Empty>}
      {people.map((p) => <PersonCard key={p.profile.id} person={p} onDone={load} />)}
    </>
  );
}

function PersonCard({ person, onDone }: { person: Person; onDone: () => void }) {
  const [goals, setGoals] = useState(person.goals);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const isPending = person.profile.status === 'pending_approval';
  const edit = (id: string, patch: Partial<Goal>) => setGoals((gs) => gs.map((g) => (g.id === id ? { ...g, ...patch } : g)));

  async function approve() {
    setBusy(true); setError('');
    const payload = goals.map((g) => ({
      id: g.id, label: g.label, prompt: g.prompt, target_value: Number(g.target_value), unit: g.unit, goal_type: g.goal_type,
    }));
    const { error } = await supabase.rpc('approve_goals', { p_user: person.profile.id, p_goals: payload });
    setBusy(false);
    if (error) setError(friendlyError(error)); else onDone();
  }

  return (
    <section className="card">
      <div className="row between">
        <div>
          <h2>{person.profile.display_name}</h2>
          <p className="small muted">@{person.profile.username} · {isPending ? 'waiting on approval' : 'active'}</p>
        </div>
        {isPending && <span className="pill amber">Pending</span>}
      </div>

      {goals.length < 5 ? (
        <p className="hint">Hasn't submitted goals yet.</p>
      ) : (
        <div className="stack">
          {goals.map((g) => (
            <div key={g.id} className="goal-edit">
              <div className="goal-edit-head">
                <span className="goal-icon sm">{THEME_ICONS[g.theme]}</span>
                <strong>{g.category === 'gym' || g.category === 'refraining' ? THEME_NAMES[g.theme] : `${THEME_NAMES[g.theme]} (${g.category.replace('_', ' ')})`}</strong>
                <span className="pill">{g.category_point_max}</span>
              </div>
              <input aria-label="Label" value={g.label} onChange={(e) => edit(g.id, { label: e.target.value })} />
              <div className="row gap">
                <input aria-label="Target" type="number" min={1} className="narrow" value={g.target_value}
                  onChange={(e) => edit(g.id, { target_value: Number(e.target.value) })} />
                <input aria-label="Unit" className="grow" value={g.unit} onChange={(e) => edit(g.id, { unit: e.target.value })} />
                {g.category.startsWith('custom') && (
                  <select aria-label="Type" value={g.goal_type} onChange={(e) => edit(g.id, { goal_type: e.target.value as Goal['goal_type'] })}>
                    <option value="percentage">quantity / wk</option>
                    <option value="binary">days / wk</option>
                  </select>
                )}
              </div>
              <input aria-label="Nightly question" className="small-input" value={g.prompt}
                onChange={(e) => edit(g.id, { prompt: e.target.value })} />
            </div>
          ))}
          <ErrorText>{error}</ErrorText>
          <button className="btn primary block" onClick={approve} disabled={busy}>
            {busy ? 'Saving…' : isPending ? 'Approve & activate' : 'Save changes'}
          </button>
        </div>
      )}
    </section>
  );
}
