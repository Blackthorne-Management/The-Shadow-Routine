import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { supabase, friendlyError } from '../lib/supabase';
import { THEME_ICONS } from '../lib/goals';
import { formatDay } from '../lib/dates';
import type { Goal, TodayContext, WeeklyScore } from '../lib/types';
import { ErrorText, Splash } from '../components/ui';

interface Answer { value: number | null; details?: { workout_type?: string; minutes?: number } }

const WORKOUT_TYPES = ['Lift', 'Cardio', 'Sport', 'Class', 'Other'];

type Step = { kind: 'goal'; goal: Goal } | { kind: 'bonus' } | { kind: 'review' };

export default function CheckIn() {
  const { profile, goals } = useAuth();
  const navigate = useNavigate();
  const [ctx, setCtx] = useState<TodayContext | null>(null);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [bonus, setBonus] = useState<boolean | null>(null);
  const [i, setI] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<WeeklyScore | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    supabase.rpc('today_context').then(({ data }) => {
      const t = data as TodayContext;
      setCtx(t);
      const pre: Record<string, Answer> = {};
      for (const e of t.entries) pre[e.goal_id] = { value: Number(e.value), details: (e.details ?? undefined) as Answer['details'] };
      setAnswers(pre);
      setBonus(t.bonus_completed);
      setEditing(t.entries.length > 0);
      // Editing jumps straight to the review screen
      if (t.entries.length > 0) setI(goals.length + (t.challenge ? 1 : 0));
    });
  }, [goals.length]);

  if (!ctx || !profile) return <Splash />;

  const steps: Step[] = [
    ...goals.map((g) => ({ kind: 'goal' as const, goal: g })),
    ...(ctx.challenge ? [{ kind: 'bonus' as const }] : []),
    { kind: 'review' as const },
  ];
  const step = steps[i];
  const next = () => setI((n) => Math.min(n + 1, steps.length - 1));
  const back = () => (i === 0 ? navigate('/') : setI(i - 1));
  const setAnswer = (id: string, a: Answer) => setAnswers((s) => ({ ...s, [id]: a }));
  const answerAndAdvance = (id: string, a: Answer) => { setAnswer(id, a); setTimeout(next, 160); };

  async function submit() {
    setBusy(true); setError('');
    const entries = goals.map((g) => ({
      goal_id: g.id,
      value: answers[g.id]?.value ?? 0,
      details: answers[g.id]?.details ?? null,
    }));
    const { error } = await supabase.rpc('submit_checkin', { p_entries: entries, p_bonus: ctx!.challenge ? bonus : null });
    if (error) { setBusy(false); setError(friendlyError(error)); return; }
    const { data } = await supabase.from('weekly_scores').select('*')
      .eq('user_id', profile!.id).eq('week_start_date', ctx!.week_start).maybeSingle();
    setBusy(false);
    setResult(data as WeeklyScore);
  }

  if (result) return <Done score={result} edited={editing} />;

  const unanswered = goals.filter((g) => answers[g.id]?.value == null);

  return (
    <main className="screen wizard">
      <header className="wizard-top">
        <button className="icon-btn" onClick={back} aria-label="Back">‹</button>
        <div className="segments" aria-label={`Step ${i + 1} of ${steps.length}`}>
          {steps.map((_, n) => <span key={n} className={n <= i ? 'on' : ''} />)}
        </div>
        <Link to="/" className="icon-btn" aria-label="Close">✕</Link>
      </header>
      <p className="eyebrow center-text">{formatDay(ctx.date)}</p>

      <div className="question" key={i}>
        {step.kind === 'goal' && (
          <GoalQuestion goal={step.goal} answer={answers[step.goal.id]}
            onAnswer={(a) => setAnswer(step.goal.id, a)}
            onAnswerAndNext={(a) => answerAndAdvance(step.goal.id, a)}
            onNext={next} />
        )}

        {step.kind === 'bonus' && ctx.challenge && (
          <>
            <span className="q-icon">⚡</span>
            <p className="eyebrow">Today's bonus · +{ctx.challenge.point_value} pts</p>
            <h1 className="q-text">{ctx.challenge.description}</h1>
            <p className="muted">Did you complete it?</p>
            <YesNo value={bonus == null ? null : bonus} onPick={(v) => { setBonus(v); setTimeout(next, 160); }} />
          </>
        )}

        {step.kind === 'review' && (
          <>
            <h1 className="q-text">{editing ? 'Edit today' : 'Look right?'}</h1>
            <ul className="review">
              {goals.map((g, n) => (
                <li key={g.id}>
                  <button className="review-row" onClick={() => setI(n)}>
                    <span className="goal-icon sm">{THEME_ICONS[g.theme]}</span>
                    <span className="grow">{g.label}</span>
                    <strong className={answers[g.id]?.value == null ? 'missing' : ''}>{formatAnswer(g, answers[g.id])}</strong>
                  </button>
                </li>
              ))}
              {ctx.challenge && (
                <li>
                  <button className="review-row" onClick={() => setI(goals.length)}>
                    <span className="goal-icon sm">⚡</span>
                    <span className="grow">{ctx.challenge.description}</span>
                    <strong className={bonus == null ? 'missing' : ''}>{bonus == null ? '—' : bonus ? 'Done' : 'Skipped'}</strong>
                  </button>
                </li>
              )}
            </ul>
            {unanswered.length > 0 && (
              <p className="hint">Unanswered goals are logged as 0 / No. Tap one to answer it.</p>
            )}
            <p className="hint">You can edit today's answers until midnight. Past days are locked.</p>
            <ErrorText>{error}</ErrorText>
            <button className="btn primary block big" onClick={submit} disabled={busy}>
              {busy ? 'Saving…' : editing ? 'Save changes' : 'Lock it in'}
            </button>
          </>
        )}
      </div>
    </main>
  );
}

function GoalQuestion({ goal, answer, onAnswer, onAnswerAndNext, onNext }: {
  goal: Goal; answer?: Answer;
  onAnswer: (a: Answer) => void; onAnswerAndNext: (a: Answer) => void; onNext: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (goal.goal_type === 'percentage') inputRef.current?.focus(); }, [goal.goal_type]);

  const header = (
    <>
      <span className="q-icon">{THEME_ICONS[goal.theme]}</span>
      <p className="eyebrow">{goal.label}</p>
      <h1 className="q-text">{goal.prompt}</h1>
    </>
  );

  if (goal.goal_type === 'percentage') {
    return (
      <>
        {header}
        <form className="number-q" onSubmit={(e) => { e.preventDefault(); if (answer?.value == null) onAnswer({ value: 0 }); onNext(); }}>
          <input ref={inputRef} type="number" inputMode="decimal" min={0} step="any" placeholder="0"
            value={answer?.value ?? ''} aria-label={goal.prompt}
            onChange={(e) => onAnswer({ value: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) })} />
          <span className="unit">{goal.unit}</span>
          <button className="btn primary block big">Next</button>
        </form>
      </>
    );
  }

  if (goal.category === 'gym') {
    const yes = answer?.value === 1;
    return (
      <>
        {header}
        <YesNo value={answer?.value == null ? null : yes}
          onPick={(v) => (v ? onAnswer({ value: 1, details: answer?.details }) : onAnswerAndNext({ value: 0 }))} />
        {yes && (
          <div className="gym-extra">
            <p className="muted small">Optional details</p>
            <div className="chips">
              {WORKOUT_TYPES.map((t) => (
                <button key={t} type="button" className={`chip ${answer?.details?.workout_type === t ? 'on' : ''}`}
                  onClick={() => onAnswer({ value: 1, details: { ...answer?.details, workout_type: t } })}>{t}</button>
              ))}
            </div>
            <label className="field inline">
              <span>Minutes</span>
              <input type="number" inputMode="numeric" min={0} value={answer?.details?.minutes ?? ''}
                onChange={(e) => onAnswer({ value: 1, details: { ...answer?.details, minutes: e.target.value ? Number(e.target.value) : undefined } })} />
            </label>
            <button className="btn primary block big" onClick={onNext}>Next</button>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      {header}
      <YesNo value={answer?.value == null ? null : answer.value === 1} onPick={(v) => onAnswerAndNext({ value: v ? 1 : 0 })} />
    </>
  );
}

function YesNo({ value, onPick }: { value: boolean | null; onPick: (v: boolean) => void }) {
  return (
    <div className="yesno">
      <button className={`yes ${value === true ? 'on' : ''}`} onClick={() => onPick(true)}>Yes</button>
      <button className={`no ${value === false ? 'on' : ''}`} onClick={() => onPick(false)}>No</button>
    </div>
  );
}

function formatAnswer(g: Goal, a?: Answer) {
  if (a?.value == null) return '—';
  if (g.goal_type === 'percentage') return `${a.value} ${g.unit}`;
  return a.value ? 'Yes' : 'No';
}

function Done({ score, edited }: { score: WeeklyScore | null; edited: boolean }) {
  return (
    <main className="screen center done-screen">
      <div className="done-mark">✓</div>
      <h1>{edited ? 'Updated' : 'Locked in'}</h1>
      {score && (
        <>
          <p className="big-number">{Math.round(Number(score.total_points))}<span className="of"> pts this week</span></p>
          <p className="muted">
            {score.is_top_this_week ? "👑 You're the most consistent in the cohort right now."
              : `You're #${score.consistency_rank} in the cohort.`}
          </p>
        </>
      )}
      <div className="stack full">
        <Link to="/board" className="btn ghost block">See the leaderboard</Link>
        <Link to="/" className="btn primary block">Done</Link>
      </div>
    </main>
  );
}
