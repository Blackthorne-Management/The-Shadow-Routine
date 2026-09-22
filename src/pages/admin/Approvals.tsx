import { useCallback, useEffect, useState } from 'react';
import { supabase, friendlyError } from '../../lib/supabase';
import { THEME_NAMES, goldTarget, sortGoals } from '../../lib/goals';
import { ThemeIcon } from '../../components/Icon';
import type { Goal, Profile } from '../../lib/types';
import { Empty, ErrorText } from '../../components/ui';

interface Stakes { ultra_punishment: string; ultra_wish: string }
interface Person { profile: Profile; goals: Goal[]; stakes: Stakes }

export default function Approvals() {
  const [showActive, setShowActive] = useState(false);
  const [people, setPeople] = useState<Person[] | null>(null);

  const load = useCallback(async () => {
    const statuses = showActive ? ['pending_approval', 'active'] : ['pending_approval'];
    const { data: profiles } = await supabase.from('profiles')
      .select('id,username,display_name,role,status,timezone,activated_at,created_at')
      .eq('role', 'participant').in('status', statuses).order('created_at');
    const ids = (profiles ?? []).map((p) => p.id);
    const [{ data: goals }, { data: stakes }] = ids.length
      ? await Promise.all([
          supabase.from('goals').select('*').in('user_id', ids),
          supabase.from('consequences').select('*').in('user_id', ids),
        ])
      : [{ data: [] as Goal[] }, { data: [] as (Stakes & { user_id: string })[] }];
    setPeople((profiles as Profile[] ?? []).map((p) => {
      const s = (stakes ?? []).find((x) => x.user_id === p.id);
      return {
        profile: p,
        goals: sortGoals((goals as Goal[]).filter((g) => g.user_id === p.id)),
        stakes: { ultra_punishment: s?.ultra_punishment ?? '', ultra_wish: s?.ultra_wish ?? '' },
      };
    }));
  }, [showActive]);

  useEffect(() => { load(); }, [load]);

  if (!people) return <div className="skeleton-list" />;
  const pending = people.filter((p) => p.profile.status === 'pending_approval');

  return (
    <>
      <label className="toggle-row">
        <input type="checkbox" checked={showActive} onChange={(e) => setShowActive(e.target.checked)} />
        Also show active participants (to adjust their goals and consequences)
      </label>
      {pending.length === 0 && !showActive && <Empty>No goal submissions waiting.</Empty>}
      {people.map((p) => <PersonCard key={p.profile.id} person={p} onDone={load} />)}
    </>
  );
}

function PersonCard({ person, onDone }: { person: Person; onDone: () => void }) {
  const [goals, setGoals] = useState(person.goals);
  const [stakes, setStakes] = useState(person.stakes);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const isPending = person.profile.status === 'pending_approval';
  const edit = (id: string, patch: Partial<Goal>) => setGoals((gs) => gs.map((g) => (g.id === id ? { ...g, ...patch } : g)));

  async function approve() {
    setBusy(true); setError('');
    const payload = goals.map((g) => ({
      id: g.id, label: g.label, prompt: g.prompt, target_value: Number(g.target_value), unit: g.unit, goal_type: g.goal_type,
      red_week_punishment: g.red_week_punishment ?? '', gold_reward: g.gold_reward ?? '', three_gold_reward: g.three_gold_reward ?? '',
      gold_month_target: g.gold_month_target ?? '',
    }));
    const { error } = await supabase.rpc('approve_goals', { p_user: person.profile.id, p_goals: payload, p_consequences: stakes });
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
        {isPending && <span className="level">Pending</span>}
      </div>

      {goals.length < 5 ? (
        <p className="hint">Hasn't submitted goals yet.</p>
      ) : (
        <div className="stack">
          {goals.map((g) => (
            <div key={g.id} className="goal-edit">
              <div className="goal-edit-head">
                <span className="goal-icon sm"><ThemeIcon theme={g.theme} /></span>
                <strong>{g.category === 'gym' ? 'Workouts (30+ min each)'
                  : g.category === 'refraining' ? THEME_NAMES[g.theme] : `${THEME_NAMES[g.theme]} (${g.category.replace('_', ' ')})`}</strong>
                <span className="pill">{g.category_point_max}</span>
              </div>
              <input aria-label="Label" value={g.label} onChange={(e) => edit(g.id, { label: e.target.value })} />
              <div className="row gap">
                <input aria-label="Weekly target" type="number" min={1} className="narrow" value={g.target_value}
                  onChange={(e) => edit(g.id, { target_value: Number(e.target.value) })} />
                <input aria-label="Unit" className="grow" value={g.unit} disabled={g.category === 'gym'}
                  onChange={(e) => edit(g.id, { unit: e.target.value })} />
                {g.category.startsWith('custom') && (
                  <select aria-label="Type" value={g.goal_type} onChange={(e) => edit(g.id, { goal_type: e.target.value as Goal['goal_type'] })}>
                    <option value="percentage">quantity / wk</option>
                    <option value="binary">days / wk</option>
                  </select>
                )}
              </div>
              {g.category !== 'gym' && (
                <input aria-label="Nightly question" className="small-input" value={g.prompt}
                  onChange={(e) => edit(g.id, { prompt: e.target.value })} />
              )}
              <label className="field">
                <span>Gold Month total (default 80% of 4 weeks = {goldTarget({ ...g, gold_month_target: null })})</span>
                <input type="number" min={1} value={g.gold_month_target ?? ''} placeholder={String(goldTarget({ ...g, gold_month_target: null }))}
                  onChange={(e) => edit(g.id, { gold_month_target: e.target.value ? Number(e.target.value) : null })} />
              </label>
              <label className="field">
                <span>Red week punishment</span>
                <input value={g.red_week_punishment ?? ''} onChange={(e) => edit(g.id, { red_week_punishment: e.target.value })} />
              </label>
              <label className="field">
                <span>Gold Month reward</span>
                <input value={g.gold_reward ?? ''} onChange={(e) => edit(g.id, { gold_reward: e.target.value })} />
              </label>
              <label className="field">
                <span>3 Gold Months reward</span>
                <input value={g.three_gold_reward ?? ''} onChange={(e) => edit(g.id, { three_gold_reward: e.target.value })} />
              </label>
            </div>
          ))}
          <div className="goal-edit">
            <div className="goal-edit-head"><strong>Month-level stakes</strong></div>
            <label className="field">
              <span>Ultra Gold Month: one wish</span>
              <input value={stakes.ultra_wish} onChange={(e) => setStakes({ ...stakes, ultra_wish: e.target.value })} />
            </label>
            <label className="field">
              <span>Ultra Red Month: Ultra Punishment</span>
              <input value={stakes.ultra_punishment} onChange={(e) => setStakes({ ...stakes, ultra_punishment: e.target.value })} />
            </label>
          </div>
          <ErrorText>{error}</ErrorText>
          <button className="btn primary block" onClick={approve} disabled={busy}>
            {busy ? 'Saving…' : isPending ? 'Approve & activate' : 'Save changes'}
          </button>
        </div>
      )}
    </section>
  );
}
