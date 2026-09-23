import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { supabase, friendlyError } from '../lib/supabase';
import {
  CATEGORY_POINTS, CUSTOM_SUGGESTIONS, DIETS, SCORED_CATEGORIES, THEME_NAMES, defaultPrompt, hasRequiredGoals,
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
  custom_1:   { category: 'custom_1', theme: 'reading', goal_type: 'percentage', label: '7 chapters / week', target_value: 7, unit: 'chapters', prompt: '', promptEdited: false, ...NO_STAKES },
  custom_2:   { category: 'custom_2', theme: 'nutrition', goal_type: 'binary', label: '', target_value: 6, unit: 'days', prompt: '', promptEdited: false, ...NO_STAKES },
  custom_3:   { category: 'custom_3', ...CUSTOM_SUGGESTIONS[0], prompt: '', promptEdited: false, ...NO_STAKES },
  custom_4:   { category: 'custom_4', ...CUSTOM_SUGGESTIONS[3], prompt: '', promptEdited: false, ...NO_STAKES },
};

// Reading's label carries the book: "7 chapters / week: Atomic Habits"
const readingLabel = (n: number, book: string) => `${n} chapters / week${book.trim() ? `: ${book.trim()}` : ''}`;
const bookOf = (label: string) => (label.includes(': ') ? label.slice(label.indexOf(': ') + 2) : '');
const dietOf = (label: string) => label.replace(/^Follow my\s+/i, '').replace(/\s+diet$/i, '');

/** Participants: goals + consequences for approval. Mentors (`mentor`): just goals, saved directly. */
export default function ProposeGoals({ mentor = false }: { mentor?: boolean }) {
  const { goals, profile, refresh, signOut } = useAuth();
  const navigate = useNavigate();
  const [drafts, setDrafts] = useState<Record<Category, Draft>>(() => {
    if (!hasRequiredGoals(goals)) return INITIAL;
    // Re-editing a pending proposal
    return { ...INITIAL, ...Object.fromEntries(goals.map((g) => [g.category, {
      category: g.category, theme: g.theme, goal_type: g.goal_type, label: g.label,
      target_value: Number(g.target_value), unit: g.unit, prompt: g.prompt, promptEdited: true,
      red_week_punishment: g.red_week_punishment ?? '', gold_reward: g.gold_reward ?? '', three_gold_reward: g.three_gold_reward ?? '',
    }])) } as Record<Category, Draft>;
  });
  const [tracking, setTracking] = useState(() => goals.some((g) => g.category === 'custom_4'));
  const [book, setBook] = useState(() => bookOf(goals.find((g) => g.category === 'custom_1')?.label ?? ''));
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
    const cats: Category[] = [...SCORED_CATEGORIES, ...(tracking ? ['custom_4' as const] : [])];
    const names: Record<string, string> = { refraining: 'Refrain', custom_1: 'Reading', custom_2: 'Eating', custom_3: 'Custom', custom_4: 'Tracking' };
    for (const c of cats) {
      const d = drafts[c];
      if (c === 'custom_1' && !book.trim()) return setError("Name the nonfiction book you're reading.");
      if (c === 'custom_2' && !dietOf(d.label).trim()) return setError('Pick or type your diet.');
      if (!d.label.trim()) return setError(`Give your ${names[c] ?? c} goal a name.`);
      if (!(d.target_value > 0)) return setError(`"${d.label}" needs a target above zero.`);
      if (c !== 'gym' && d.goal_type !== 'percentage' && d.target_value > 7) return setError(`"${d.label}": a week only has 7 days.`);
      if (!mentor && c !== 'custom_4' && (!d.red_week_punishment.trim() || !d.gold_reward.trim() || !d.three_gold_reward.trim())) {
        return setError(`"${d.label || names[c]}" needs its red-week punishment and both rewards.`);
      }
    }
    if (!mentor && (!ultra.ultra_punishment.trim() || !ultra.ultra_wish.trim())) return setError('Add your Ultra Punishment and your one wish.');
    setBusy(true);
    const payload = cats.map((c) => {
      const d = drafts[c];
      return {
        category: c, theme: d.theme, goal_type: d.goal_type, label: d.label.trim(),
        prompt: promptFor(d).trim(), target_value: d.target_value, unit: d.unit.trim() || 'days',
        red_week_punishment: d.red_week_punishment.trim(), gold_reward: d.gold_reward.trim(), three_gold_reward: d.three_gold_reward.trim(),
      };
    });
    const { error } = mentor
      ? await supabase.rpc('mentor_save_goals', { p_goals: payload })
      : await supabase.rpc('submit_goals', { p_goals: payload, p_consequences: ultra });
    setBusy(false);
    if (error) return setError(friendlyError(error));
    await refresh();
    navigate(mentor ? '/today' : '/waiting', { replace: true });
  }

  const gym = drafts.gym;
  const ref = drafts.refraining;
  const vice = ref.label.replace(/^No\s+/i, '');

  return (
    <main className="screen">
      <TopBar pill={mentor ? 'Mentor' : 'Step 1 of 2'} />
      <section className="card">
        <h1>{mentor ? 'Your goals' : 'Set your goals'}</h1>
        <p className="muted">
          {mentor
            ? "Check in alongside your cohort. You're scored every week and shown on the board, but unranked: no place, no punishments, no rewards. You can change these any time."
            : "Five required goals (workouts, refrain, reading, eating and one custom), plus an optional one just for tracking. Your mentor reviews them before you start and may adjust targets. Each required goal is scored weekly (Mon–Sun) and judged monthly for Gold Months. Write each goal's punishment and rewards with your coach."}
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
        {!mentor && <Stakes d={gym} onChange={(p) => update('gym', p)} />}
      </section>

      <section className="card">
        <GoalHead icon={<ThemeIcon theme="refraining" />} title="Refrain" points={CATEGORY_POINTS.refraining} />
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
        {!mentor && <Stakes d={ref} onChange={(p) => update('refraining', p)} />}
      </section>

      <section className="card">
        <GoalHead icon={<ThemeIcon theme="reading" />} title="Reading" points={CATEGORY_POINTS.custom_1} />
        <label className="field">
          <span>Your nonfiction book (one that helps toward your goals)</span>
          <input value={book} maxLength={80} placeholder="e.g. Atomic Habits"
            onChange={(e) => { setBook(e.target.value); update('custom_1', { label: readingLabel(drafts.custom_1.target_value, e.target.value) }); }} />
        </label>
        <label className="field">
          <span>Chapters per week</span>
          <Stepper value={drafts.custom_1.target_value} min={1} max={50}
            onChange={(n) => update('custom_1', { target_value: n, label: readingLabel(n, book) })} />
        </label>
        <p className="hint">Finish the book? Tell your mentor and keep going with the next one.</p>
        <PromptPreview d={drafts.custom_1} prompt={promptFor(drafts.custom_1)} onEdit={(p) => update('custom_1', { prompt: p, promptEdited: true })} />
        {!mentor && <Stakes d={drafts.custom_1} onChange={(p) => update('custom_1', p)} />}
      </section>

      <section className="card">
        <GoalHead icon={<ThemeIcon theme="nutrition" />} title="Eating" points={CATEGORY_POINTS.custom_2} />
        <div className="chips" role="radiogroup" aria-label="Your diet">
          {DIETS.map((diet) => (
            <button key={diet} type="button" role="radio" aria-checked={dietOf(drafts.custom_2.label) === diet}
              className={`chip ${dietOf(drafts.custom_2.label) === diet ? 'on' : ''}`}
              onClick={() => update('custom_2', { label: `Follow my ${diet} diet`, promptEdited: false })}>{diet}</button>
          ))}
        </div>
        <label className="field">
          <span>Your diet</span>
          <input value={dietOf(drafts.custom_2.label)} maxLength={60} placeholder="Pick one above or type your own"
            onChange={(e) => update('custom_2', { label: e.target.value ? `Follow my ${e.target.value} diet` : '', promptEdited: false })} />
        </label>
        <label className="field">
          <span>Days per week on plan</span>
          <Stepper value={drafts.custom_2.target_value} min={1} max={7} onChange={(n) => update('custom_2', { target_value: n })} />
        </label>
        <PromptPreview d={drafts.custom_2} prompt={promptFor(drafts.custom_2)} onEdit={(p) => update('custom_2', { prompt: p, promptEdited: true })} />
        {!mentor && <Stakes d={drafts.custom_2} onChange={(p) => update('custom_2', p)} />}
      </section>

      <CustomGoal title="Custom goal" d={drafts.custom_3} prompt={promptFor(drafts.custom_3)} onChange={(p) => update('custom_3', p)} stakes={!mentor} />

      {tracking ? (
        <CustomGoal title="Tracking goal (optional)" d={drafts.custom_4} prompt={promptFor(drafts.custom_4)}
          onChange={(p) => update('custom_4', p)} stakes={false}
          note={<>Just for tracking: it's in your nightly check-in, but it's never scored and has no punishment or reward.{' '}
            <button type="button" className="link" onClick={() => setTracking(false)}>Remove it</button></>} />
      ) : (
        <button type="button" className="btn block" onClick={() => setTracking(true)}>+ Add an optional tracking goal (no points)</button>
      )}

      {!mentor && <section className="card">
        <GoalHead icon={<Icon name="crown" />} title="Your month-level stakes" points={0} />
        <p className="muted">
          Each month is also judged across your five required goals. 80%+ in every goal with no gray weeks is an
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
      </section>}

      <ErrorText>{error}</ErrorText>
      <button className="btn primary block sticky-cta" onClick={submit} disabled={busy}>
        {busy ? 'Saving…' : mentor ? 'Save my goals' : 'Submit for approval'}
      </button>
      {!mentor && (
        <div className="center-text">
          <button className="link muted" onClick={signOut}>Sign out</button>
        </div>
      )}
    </main>
  );
}

function CustomGoal({ title, d, prompt, onChange, stakes = true, note }: {
  title: string; d: Draft; prompt: string; onChange: (p: Partial<Draft>) => void; stakes?: boolean; note?: ReactNode;
}) {
  return (
    <section className="card">
      <GoalHead icon={<ThemeIcon theme={d.theme} />} title={title} points={CATEGORY_POINTS[d.category]} />
      {note && <p className="hint">{note}</p>}
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
      {stakes && <Stakes d={d} onChange={onChange} />}
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
