import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { supabase, friendlyError } from '../lib/supabase';
import {
  CATEGORY_ORDER, CATEGORY_POINTS, CUSTOM_SUGGESTIONS, THEME_NAMES, defaultPrompt,
} from '../lib/goals';
import type { Category, GoalType, Theme } from '../lib/types';
import { ErrorText, TopBar } from '../components/ui';
import { Icon, ThemeIcon } from '../components/Icon';

interface Draft {
  category: Category;
  theme: Theme;
  goal_type: GoalType;
  label: string;
  target_value: number;
  unit: string;
  prompt: string;
  promptEdited: boolean;
  red_week_punishment: string;
  gold_reward: string;
  three_gold_reward: string;
}

const NO_STAKES = { red_week_punishment: '', gold_reward: '', three_gold_reward: '' };

const INITIAL: Record<Category, Draft> = {
  gym:        { category: 'gym', theme: 'gym', goal_type: 'percentage', label: '4 workouts / week (30+ min each)', target_value: 4, unit: 'workouts', prompt: '', promptEdited: false, ...NO_STAKES },
  refraining: { category: 'refraining', theme: 'refraining', goal_type: 'inverse', label: '', target_value: 7, unit: 'days', prompt: '', promptEdited: false, ...NO_STAKES },
  custom_1:   { category: 'custom_1', ...CUSTOM_SUGGESTIONS[0], prompt: '', promptEdited: false, ...NO_STAKES },
  custom_2:   { category: 'custom_2', ...CUSTOM_SUGGESTIONS[1], prompt: '', promptEdited: false, ...NO_STAKES },
  custom_3:   { category: 'custom_3', ...CUSTOM_SUGGESTIONS[2], prompt: '', promptEdited: false, ...NO_STAKES },
};

export default function ProposeGoals() {
  const { goals, profile, refresh, signOut } = useAuth();
  const navigate = useNavigate();
  const [drafts, setDrafts] = useState<Record<Category, Draft>>(() => {
    if (goals.length !== 5) return INITIAL;
    // Re-editing a pending proposal
    return Object.fromEntries(goals.map((g) => [g.category, {
      category: g.category, theme: g.theme, goal_type: g.goal_type, label: g.label,
      target_value: Number(g.target_value), unit: g.unit, prompt: g.prompt, promptEdited: true,
      red_week_punishment: g.red_week_punishment ?? '', gold_reward: g.gold_reward ?? '', three_gold_reward: g.three_gold_reward ?? '',
    }])) as Record<Category, Draft>;
  });
  const [ultra, setUltra] = useState({ ultra_punishment: '', ultra_wish: '' });
  // Re-editing: load the consequences submitted last time
  useEffect(() => {
    if (!profile) return;
    supabase.from('consequences').select('ultra_punishment,ultra_wish').eq('user_id', profile.id).maybeSingle()
      .then(({ data }) => { if (data) setUltra({ ultra_punishment: data.ultra_punishment ?? '', ultra_wish: data.ultra_wish ?? '' }); });
  }, [profile]);
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
      if (c !== 'gym' && d.goal_type !== 'percentage' && d.target_value > 7) return setError(`"${d.label}": a week only has 7 days.`);
      if (!d.red_week_punishment.trim() || !d.gold_reward.trim() || !d.three_gold_reward.trim()) {
        return setError(`"${d.label || c}" needs its red-week punishment and both rewards.`);
      }
    }
    if (!ultra.ultra_punishment.trim() || !ultra.ultra_wish.trim()) return setError('Add your Ultra Punishment and your one wish.');
    setBusy(true);
    const payload = CATEGORY_ORDER.map((c) => {
      const d = drafts[c];
      return {
        category: c, theme: d.theme, goal_type: d.goal_type, label: d.label.trim(),
        prompt: promptFor(d).trim(), target_value: d.target_value, unit: d.unit.trim() || 'days',
        red_week_punishment: d.red_week_punishment.trim(), gold_reward: d.gold_reward.trim(), three_gold_reward: d.three_gold_reward.trim(),
      };
    });
    const { error } = await supabase.rpc('submit_goals', { p_goals: payload, p_consequences: ultra });
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
      <TopBar pill="Step 1 of 2" />
      <section className="card">
        <h1>Set your five goals</h1>
        <p className="muted">
          Your mentor reviews these before you start, and may adjust targets. Every goal is scored weekly (Mon–Sun),
          and judged monthly for Gold Months. Write each goal's punishment and rewards with your coach.
        </p>
      </section>

      <section className="card">
        <GoalHead icon={<ThemeIcon theme="gym" />} title="Workouts" points={CATEGORY_POINTS.gym} />
        <label className="field">
          <span>Workouts per week</span>
          <Stepper value={gym.target_value} min={1} max={21}
            onChange={(n) => update('gym', { target_value: n, label: `${n} workouts / week (30+ min each)` })} />
        </label>
        <p className="hint">
          A workout is any session of 30+ minutes, so a run and a lift on the same day count as two.
          Every workout needs a photo or short clip taken while you're doing it.
        </p>
        <Stakes d={gym} onChange={(p) => update('gym', p)} />
      </section>

      <section className="card">
        <GoalHead icon={<ThemeIcon theme="refraining" />} title="Refraining" points={CATEGORY_POINTS.refraining} />
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
        <Stakes d={ref} onChange={(p) => update('refraining', p)} />
      </section>

      {(['custom_1', 'custom_2', 'custom_3'] as const).map((c, i) => (
        <CustomGoal key={c} n={i + 1} d={drafts[c]} prompt={promptFor(drafts[c])} onChange={(p) => update(c, p)} />
      ))}

      <section className="card">
        <GoalHead icon={<Icon name="crown" />} title="Your month-level stakes" points={0} />
        <p className="muted">
          Each month is also judged across all five goals. 80%+ in every goal with no gray weeks is an
          <b> Ultra Gold Month</b>; under 60% overall is an <b>Ultra Red Month</b>.
        </p>
        <label className="field">
          <span>Ultra Gold Month: your one wish</span>
          <input value={ultra.ultra_wish} maxLength={240} placeholder="Grant yourself one wish…"
            onChange={(e) => setUltra({ ...ultra, ultra_wish: e.target.value })} />
        </label>
        <label className="field">
          <span>Ultra Red Month: your Ultra Punishment</span>
          <input value={ultra.ultra_punishment} maxLength={240} placeholder="Something harsh, in reference to your goals"
            onChange={(e) => setUltra({ ...ultra, ultra_punishment: e.target.value })} />
        </label>
      </section>

      <ErrorText>{error}</ErrorText>
      <button className="btn primary block sticky-cta" onClick={submit} disabled={busy}>
        {busy ? 'Submitting…' : 'Submit for approval'}
      </button>
      <div className="center-text">
        <button className="link muted" onClick={signOut}>Sign out</button>
      </div>
    </main>
  );
}

function CustomGoal({ n, d, prompt, onChange }: {
  n: number; d: Draft; prompt: string; onChange: (p: Partial<Draft>) => void;
}) {
  return (
    <section className="card">
      <GoalHead icon={<ThemeIcon theme={d.theme} />} title={`Custom goal ${n}`} points={CATEGORY_POINTS[d.category]} />
      <div className="chips" role="radiogroup" aria-label="Goal area">
        {CUSTOM_SUGGESTIONS.map((s) => (
          <button key={s.theme} type="button" role="radio" aria-checked={d.theme === s.theme}
            className={`chip ${d.theme === s.theme ? 'on' : ''}`}
            onClick={() => onChange({ ...s, label: s.label || d.label, promptEdited: false })}>
            <ThemeIcon theme={s.theme} size={15} /> {THEME_NAMES[s.theme]}
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
      <Stakes d={d} onChange={onChange} />
    </section>
  );
}

/** A goal's consequences, written with the coach. */
function Stakes({ d, onChange }: { d: Draft; onChange: (p: Partial<Draft>) => void }) {
  return (
    <div className="stakes">
      <p className="eyebrow">Consequences (write these with your coach)</p>
      <label className="field">
        <span>Red week punishment (done the following week, shown to your mentor)</span>
        <input value={d.red_week_punishment} maxLength={240} placeholder="e.g. 500 burpees in a single day"
          onChange={(e) => onChange({ red_week_punishment: e.target.value })} />
      </label>
      <label className="field">
        <span>Gold Month reward</span>
        <input value={d.gold_reward} maxLength={240} placeholder="e.g. A spa day"
          onChange={(e) => onChange({ gold_reward: e.target.value })} />
      </label>
      <label className="field">
        <span>3 Gold Months reward</span>
        <input value={d.three_gold_reward} maxLength={240} placeholder="e.g. Full workout wardrobe splurge"
          onChange={(e) => onChange({ three_gold_reward: e.target.value })} />
      </label>
    </div>
  );
}

function GoalHead({ icon, title, points }: { icon: ReactNode; title: string; points: number }) {
  return (
    <div className="goal-head">
      <span className="goal-icon">{icon}</span>
      <h2>{title}</h2>
      {points > 0 && <span className="level">{points} pts</span>}
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
