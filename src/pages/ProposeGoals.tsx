import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { supabase, friendlyError } from '../lib/supabase';
import {
  CATEGORY_ORDER, CATEGORY_POINTS, CUSTOM_SUGGESTIONS, THEME_ICONS, THEME_NAMES, defaultPrompt,
} from '../lib/goals';
import type { Category, GoalType, Theme } from '../lib/types';
import { ErrorText, PageHeader } from '../components/ui';

interface Draft {
  category: Category;
  theme: Theme;
  goal_type: GoalType;
  label: string;
  target_value: number;
  unit: string;
  prompt: string;
  promptEdited: boolean;
}

const INITIAL: Record<Category, Draft> = {
  gym:        { category: 'gym', theme: 'gym', goal_type: 'binary', label: 'Workout 4x, 30+ min', target_value: 4, unit: 'workouts', prompt: '', promptEdited: false },
  refraining: { category: 'refraining', theme: 'refraining', goal_type: 'inverse', label: '', target_value: 7, unit: 'days', prompt: '', promptEdited: false },
  custom_1:   { category: 'custom_1', ...CUSTOM_SUGGESTIONS[0], prompt: '', promptEdited: false },
  custom_2:   { category: 'custom_2', ...CUSTOM_SUGGESTIONS[1], prompt: '', promptEdited: false },
  custom_3:   { category: 'custom_3', ...CUSTOM_SUGGESTIONS[2], prompt: '', promptEdited: false },
};

export default function ProposeGoals() {
  const { goals, refresh, signOut } = useAuth();
  const navigate = useNavigate();
  const [drafts, setDrafts] = useState<Record<Category, Draft>>(() => {
    if (goals.length !== 5) return INITIAL;
    // Re-editing a pending proposal
    return Object.fromEntries(goals.map((g) => [g.category, {
      category: g.category, theme: g.theme, goal_type: g.goal_type, label: g.label,
      target_value: Number(g.target_value), unit: g.unit, prompt: g.prompt, promptEdited: true,
    }])) as Record<Category, Draft>;
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const update = (c: Category, patch: Partial<Draft>) =>
    setDrafts((d) => ({ ...d, [c]: { ...d[c], ...patch } }));

  const promptFor = (d: Draft) => (d.promptEdited ? d.prompt : defaultPrompt(d));

  async function submit() {
    setError('');
    for (const c of CATEGORY_ORDER) {
      const d = drafts[c];
      if (!d.label.trim()) return setError(`Give your ${c === 'refraining' ? 'refraining' : c.replace('_', ' ')} goal a name.`);
      if (!(d.target_value > 0)) return setError(`"${d.label}" needs a target above zero.`);
      if (d.goal_type !== 'percentage' && d.target_value > 7) return setError(`"${d.label}": a week only has 7 days.`);
    }
    setBusy(true);
    const payload = CATEGORY_ORDER.map((c) => {
      const d = drafts[c];
      return {
        category: c, theme: d.theme, goal_type: d.goal_type, label: d.label.trim(),
        prompt: promptFor(d).trim(), target_value: d.target_value, unit: d.unit.trim() || 'days',
      };
    });
    const { error } = await supabase.rpc('submit_goals', { p_goals: payload });
    setBusy(false);
    if (error) return setError(friendlyError(error));
    await refresh();
    navigate('/waiting', { replace: true });
  }

  const gym = drafts.gym;
  const ref = drafts.refraining;
  const vice = ref.label.replace(/^No\s+/i, '');

  return (
    <main className="screen">
      <PageHeader subtitle="Step 1 of 2" title="Set your five goals"
        right={<button className="link" onClick={signOut}>Sign out</button>} />
      <p className="muted">
        Your mentor reviews these before you start, and may adjust targets. Every goal is scored weekly (Mon–Sun).
      </p>

      <section className="card">
        <GoalHead icon="🏋️" title="Gym" points={CATEGORY_POINTS.gym} />
        <label className="field">
          <span>Workouts per week (30+ min each)</span>
          <Stepper value={gym.target_value} min={1} max={7}
            onChange={(n) => update('gym', { target_value: n, label: `Workout ${n}x, 30+ min` })} />
        </label>
        <PromptPreview d={gym} prompt={promptFor(gym)} onEdit={(p) => update('gym', { prompt: p, promptEdited: true })} />
      </section>

      <section className="card">
        <GoalHead icon="🚫" title="Refraining" points={CATEGORY_POINTS.refraining} />
        <label className="field">
          <span>What are you giving up?</span>
          <input value={vice} placeholder="e.g. alcohol, porn, weed, sugar"
                 onChange={(e) => update('refraining', { label: e.target.value ? `No ${e.target.value}` : '' })} />
        </label>
        <label className="field">
          <span>Clean days per week</span>
          <Stepper value={ref.target_value} min={1} max={7} onChange={(n) => update('refraining', { target_value: n })} />
        </label>
        <p className="hint">Only you and your mentor can see this goal. The leaderboard shows just a colored dot.</p>
        <PromptPreview d={ref} prompt={promptFor(ref)} onEdit={(p) => update('refraining', { prompt: p, promptEdited: true })} />
      </section>

      {(['custom_1', 'custom_2', 'custom_3'] as const).map((c, i) => (
        <CustomGoal key={c} n={i + 1} d={drafts[c]} prompt={promptFor(drafts[c])} onChange={(p) => update(c, p)} />
      ))}

      <ErrorText>{error}</ErrorText>
      <button className="btn primary block sticky-cta" onClick={submit} disabled={busy}>
        {busy ? 'Submitting…' : 'Submit for approval'}
      </button>
    </main>
  );
}

function CustomGoal({ n, d, prompt, onChange }: {
  n: number; d: Draft; prompt: string; onChange: (p: Partial<Draft>) => void;
}) {
  return (
    <section className="card">
      <GoalHead icon={THEME_ICONS[d.theme]} title={`Custom goal ${n}`} points={CATEGORY_POINTS[d.category]} />
      <div className="chips" role="radiogroup" aria-label="Goal area">
        {CUSTOM_SUGGESTIONS.map((s) => (
          <button key={s.theme} type="button" role="radio" aria-checked={d.theme === s.theme}
            className={`chip ${d.theme === s.theme ? 'on' : ''}`}
            onClick={() => onChange({ ...s, label: s.label || d.label, promptEdited: false })}>
            {THEME_ICONS[s.theme]} {THEME_NAMES[s.theme]}
          </button>
        ))}
      </div>
      <label className="field">
        <span>Goal</span>
        <input value={d.label} maxLength={80} placeholder="Describe the goal" onChange={(e) => onChange({ label: e.target.value })} />
      </label>
      <div className="seg" role="radiogroup" aria-label="How it's measured">
        <button type="button" className={d.goal_type === 'percentage' ? 'on' : ''}
          onClick={() => onChange({ goal_type: 'percentage', unit: d.unit === 'days' ? 'pages' : d.unit })}>Quantity</button>
        <button type="button" className={d.goal_type === 'binary' ? 'on' : ''}
          onClick={() => onChange({ goal_type: 'binary', unit: 'days', target_value: Math.min(d.target_value, 7) })}>Yes / No daily</button>
      </div>
      {d.goal_type === 'percentage' ? (
        <div className="row gap">
          <label className="field grow">
            <span>Weekly target</span>
            <input type="number" inputMode="decimal" min={1} value={d.target_value || ''}
                   onChange={(e) => onChange({ target_value: Number(e.target.value) })} />
          </label>
          <label className="field grow">
            <span>Unit</span>
            <input value={d.unit} maxLength={24} placeholder="pages, posts…" onChange={(e) => onChange({ unit: e.target.value })} />
          </label>
        </div>
      ) : (
        <label className="field">
          <span>Days per week</span>
          <Stepper value={d.target_value} min={1} max={7} onChange={(v) => onChange({ target_value: v })} />
        </label>
      )}
      <PromptPreview d={d} prompt={prompt} onEdit={(p) => onChange({ prompt: p, promptEdited: true })} />
    </section>
  );
}

function GoalHead({ icon, title, points }: { icon: string; title: string; points: number }) {
  return (
    <div className="goal-head">
      <span className="goal-icon">{icon}</span>
      <h2>{title}</h2>
      <span className="pill">{points} pts</span>
    </div>
  );
}

function PromptPreview({ prompt, onEdit }: { d: Draft; prompt: string; onEdit: (p: string) => void }) {
  return (
    <label className="field prompt">
      <span>Nightly question</span>
      <input value={prompt} maxLength={160} onChange={(e) => onEdit(e.target.value)} />
    </label>
  );
}

export function Stepper({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (n: number) => void }) {
  return (
    <div className="stepper">
      <button type="button" aria-label="Decrease" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min}>−</button>
      <output>{value}</output>
      <button type="button" aria-label="Increase" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max}>+</button>
    </div>
  );
}
