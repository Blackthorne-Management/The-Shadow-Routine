import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { supabase, friendlyError } from '../lib/supabase';
import { Icon, ThemeIcon } from '../components/Icon';
import { formatDay } from '../lib/dates';
import type { Goal, TodayContext, WeeklyScore, Workout } from '../lib/types';
import { ErrorText, Splash } from '../components/ui';
import MediaThumb from '../components/MediaThumb';
import RankCard, { LevelUp } from '../components/RankCard';
import type { Sex } from '../lib/types';

interface Answer { value: number | null; details?: Record<string, unknown> }

const WORKOUT_TYPES = ['Walk / Run', 'Lifting', 'Cardio', 'Sport', 'Class', 'Yoga / Mobility', 'Other'];
const MAX_MB = 50; // Supabase free-tier per-file limit

type Step = { kind: 'goal'; goal: Goal } | { kind: 'bonus' } | { kind: 'review' };

export default function CheckIn() {
  const { profile, goals, refresh } = useAuth();
  const navigate = useNavigate();
  const homePath = profile?.role === 'admin' ? '/today' : '/';
  const home = homePath;
  const [rank, setRank] = useState<{ before: number; after: number; levelBefore: number; levelAfter: number } | null>(null);
  const [celebrated, setCelebrated] = useState(false);
  const [ctx, setCtx] = useState<TodayContext | null>(null);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  // null = workout question not answered yet; [] = "No, didn't work out"
  const [workouts, setWorkouts] = useState<Workout[] | null>(null);
  const [bonus, setBonus] = useState<boolean | null>(null);
  const [i, setI] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<WeeklyScore | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    supabase.rpc('today_context').then(({ data }) => {
      const t = data as TodayContext;
      setCtx(t);
      const pre: Record<string, Answer> = {};
      for (const e of t.entries) pre[e.goal_id] = { value: Number(e.value), details: (e.details ?? undefined) as Answer['details'] };
      setAnswers(pre);
      const logged = t.entries.length > 0;
      setWorkouts(t.workouts.length ? t.workouts : logged ? [] : null);
      setBonus(t.bonus_completed);
      setEditing(logged);
      // Editing jumps straight to the review screen
      if (logged) setI(goals.length + (t.challenge ? 1 : 0));
    });
  }, [goals.length]);

  if (!ctx || !profile) return <Splash />;

  if (ctx.program.status === 'prep' || ctx.program.status === 'ended') {
    return (
      <main className="screen">
        <section className="card auth-hero">
          <h1>{ctx.program.status === 'prep' ? 'Not yet.' : 'Program complete.'}</h1>
          <p className="muted">
            {ctx.program.status === 'prep'
              ? `Check-ins open on program week 1 (${formatDay(ctx.program.start_date!)}). The two prep weeks happen before that, and count as green weeks for everyone.`
              : 'The 12 weeks are done. Your history stays here, read-only.'}
          </p>
        </section>
        <Link to={home} className="btn primary block">Back</Link>
      </main>
    );
  }

  const steps: Step[] = [
    ...goals.map((g) => ({ kind: 'goal' as const, goal: g })),
    ...(ctx.challenge ? [{ kind: 'bonus' as const }] : []),
    { kind: 'review' as const },
  ];
  const step = steps[i];
  const next = () => setI((n) => Math.min(n + 1, steps.length - 1));
  const back = () => (i === 0 ? navigate(homePath) : setI(i - 1));
  const setAnswer = (id: string, a: Answer) => setAnswers((s) => ({ ...s, [id]: a }));
  const answerAndAdvance = (id: string, a: Answer) => { setAnswer(id, a); setTimeout(next, 160); };

  async function submit() {
    // "Yes" on the challenge needs a photo: send them back to add one
    const ch = ctx!.challenge;
    if (ch && bonus && (!ch.photo_path || ch.review_status === 'rejected')) {
      setError('');
      setI(goals.length);
      return;
    }
    setBusy(true); setError('');
    const readRank = async () => (await supabase.from('profiles').select('cumulative_cycle_points,rank_level').eq('id', profile!.id).single()).data;
    const pre = await readRank();
    const entries = goals.filter((g) => g.category !== 'gym').map((g) => ({
      goal_id: g.id,
      value: answers[g.id]?.value ?? 0,
      details: answers[g.id]?.details ?? null,
    }));
    const p_workouts = workouts?.map(({ workout_type, minutes, media_path, exception_note }) =>
      ({ workout_type, minutes, media_path, exception_note })) ?? [];
    const { error } = await supabase.rpc('submit_checkin', { p_entries: entries, p_bonus: ctx!.challenge ? bonus : null, p_workouts });
    if (error) { setBusy(false); setError(friendlyError(error)); return; }
    const [{ data }, post] = await Promise.all([
      supabase.from('weekly_scores').select('*').eq('user_id', profile!.id).eq('week_start_date', ctx!.week_start).maybeSingle(),
      readRank(),
    ]);
    setRank({
      before: Number(pre?.cumulative_cycle_points ?? 0), after: Number(post?.cumulative_cycle_points ?? 0),
      levelBefore: pre?.rank_level ?? 1, levelAfter: post?.rank_level ?? 1,
    });
    setBusy(false);
    setResult((data as WeeklyScore) ?? null);
    setSubmitted(true);
    refresh();
  }

  if (submitted) {
    if (rank && rank.levelAfter > rank.levelBefore && !celebrated) {
      return <LevelUp level={rank.levelAfter} sex={profile.sex} onDone={() => setCelebrated(true)} />;
    }
    return <Done score={result} edited={editing} rank={rank} sex={profile.sex} home={home} />;
  }

  const unanswered = goals.filter((g) => (g.category === 'gym' ? workouts == null : answers[g.id]?.value == null));

  return (
    <main className="screen wizard">
      <header className="wizard-top">
        <button className="icon-btn" onClick={back} aria-label="Back"><Icon name="back" /></button>
        <div className="segments" aria-label={`Step ${i + 1} of ${steps.length}`}>
          {steps.map((_, n) => <span key={n} className={n <= i ? 'on' : ''} />)}
        </div>
        <Link to={home} className="icon-btn" aria-label="Close"><Icon name="close" /></Link>
      </header>

      <div className="question" key={i}>
        {step.kind === 'goal' && step.goal.category === 'gym' && (
          <WorkoutQuestion goal={step.goal} userId={profile.id} date={ctx.date}
            initial={workouts} onDone={(w) => { setWorkouts(w); next(); }} />
        )}

        {step.kind === 'goal' && step.goal.category !== 'gym' && (
          <GoalQuestion goal={step.goal} answer={answers[step.goal.id]}
            onAnswer={(a) => setAnswer(step.goal.id, a)}
            onAnswerAndNext={(a) => answerAndAdvance(step.goal.id, a)}
            onNext={next} />
        )}

        {step.kind === 'bonus' && ctx.challenge && (
          <BonusStep challenge={ctx.challenge} date={ctx.date} userId={profile.id} value={bonus}
            onChallenge={(c) => setCtx((x) => (x ? { ...x, challenge: c } : x))}
            onPick={(v, advance) => { setBonus(v); if (advance) setTimeout(next, 160); }} onNext={next} />
        )}

        {step.kind === 'review' && (
          <>
            <section className="card">
              <p className="eyebrow">{formatDay(ctx.date)}</p>
              <h1 className="q-text">{editing ? 'Edit today' : 'Look right?'}</h1>
            </section>
            <ul className="review">
              {goals.map((g, n) => (
                <li key={g.id}>
                  <button className="review-row" onClick={() => setI(n)}>
                    <span className="goal-icon sm"><ThemeIcon theme={g.theme} /></span>
                    <span className="grow">{g.label}</span>
                    {g.category === 'gym'
                      ? <strong className={workouts == null ? 'missing' : ''}>{formatWorkouts(workouts)}</strong>
                      : <strong className={answers[g.id]?.value == null ? 'missing' : ''}>{formatAnswer(g, answers[g.id])}</strong>}
                  </button>
                </li>
              ))}
              {ctx.challenge && (
                <li>
                  <button className="review-row" onClick={() => setI(goals.length)}>
                    <span className="goal-icon sm"><Icon name="bolt" /></span>
                    <span className="grow">{ctx.challenge.description}</span>
                    {(() => {
                      const needsPhoto = bonus && (!ctx.challenge.photo_path || ctx.challenge.review_status === 'rejected');
                      return <strong className={bonus == null || needsPhoto ? 'missing' : ''}>
                        {bonus == null ? '—' : needsPhoto ? 'Add a photo' : bonus ? 'Done · photo' : 'Skipped'}
                      </strong>;
                    })()}
                  </button>
                </li>
              )}
            </ul>
            {unanswered.length > 0 && (
              <p className="hint">Unanswered goals are logged as 0 / No. Tap one to answer it.</p>
            )}
            {workouts?.some((w) => !w.media_path) && (
              <p className="hint">Workouts without a photo only count once your mentor accepts your explanation.</p>
            )}
            <p className="hint">You can edit today's answers until midnight. Past days are locked.</p>
            <ErrorText>{error}</ErrorText>
            <button className="btn accent block big" onClick={submit} disabled={busy}>
              {busy ? 'Saving…' : editing ? 'Save changes' : 'Lock it in'}
            </button>
          </>
        )}
      </div>
    </main>
  );
}

function QuestionCard({ goal, title, eyebrow }: { goal: Goal; title: string; eyebrow?: string }) {
  return (
    <section className="card q-card">
      <div className="row between">
        <span className="goal-icon"><ThemeIcon theme={goal.theme} /></span>
        <span className="level">{goal.category_point_max} pts</span>
      </div>
      <div className="stack tight">
        <p className="eyebrow">{eyebrow ?? goal.label}</p>
        <h1 className="q-text">{title}</h1>
      </div>
    </section>
  );
}

/**
 * Workouts: "Did you work out 30+ min?" → "How many times?" → per workout:
 * what it was, minutes (30+), and a photo/clip — or a note asking the mentor.
 */
function WorkoutQuestion({ goal, userId, date, initial, onDone }: {
  goal: Goal; userId: string; date: string; initial: Workout[] | null; onDone: (w: Workout[]) => void;
}) {
  const [list, setList] = useState<Workout[]>(initial ?? []);
  const [stage, setStage] = useState<'ask' | 'count' | number>(initial && initial.length ? 'count' : 'ask');
  const [count, setCount] = useState(Math.max(1, initial?.length ?? 1));

  if (stage === 'ask') {
    return (
      <>
        <QuestionCard goal={goal} title="Did you work out for 30 minutes or more today?" />
        <YesNo value={initial == null ? null : initial.length > 0}
          onPick={(v) => (v ? setStage('count') : setTimeout(() => onDone([]), 160))} />
      </>
    );
  }

  if (stage === 'count') {
    return (
      <>
        <QuestionCard goal={goal} title="How many times?" eyebrow="Each 30+ minute session is its own workout" />
        <div className="center-stepper">
          <button type="button" aria-label="Fewer" onClick={() => setCount((c) => Math.max(1, c - 1))} disabled={count <= 1}>−</button>
          <output>{count}</output>
          <button type="button" aria-label="More" onClick={() => setCount((c) => Math.min(6, c + 1))} disabled={count >= 6}>+</button>
        </div>
        <p className="muted center-text">{count === 1 ? 'workout today' : 'workouts today'}</p>
        <button className="btn primary block big" onClick={() => {
          setList((l) => Array.from({ length: count }, (_, n) => l[n] ?? { workout_type: '', minutes: 0, media_path: null, exception_note: null }));
          setStage(0);
        }}>Next</button>
      </>
    );
  }

  const n = stage;
  return (
    <WorkoutDetail key={n} goal={goal} index={n} total={list.length} userId={userId} date={date}
      value={list[n]}
      onBack={() => setStage(n === 0 ? 'count' : n - 1)}
      onSave={(w) => {
        const nextList = list.map((x, k) => (k === n ? w : x));
        setList(nextList);
        if (n + 1 < nextList.length) setStage(n + 1); else onDone(nextList);
      }} />
  );
}

function WorkoutDetail({ goal, index, total, userId, date, value, onSave, onBack }: {
  goal: Goal; index: number; total: number; userId: string; date: string; value: Workout;
  onSave: (w: Workout) => void; onBack: () => void;
}) {
  const [w, setW] = useState<Workout>(value);
  const [askMentor, setAskMentor] = useState(!value.media_path && !!value.exception_note);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const rejected = value.status === 'rejected';

  async function pickMedia(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_MB * 1024 * 1024) { setError(`Files must be under ${MAX_MB} MB.`); return; }
    setError(''); setUploading(true);
    const ext = (file.name.split('.').pop() || (file.type.startsWith('video') ? 'mp4' : 'jpg')).toLowerCase().replace(/[^a-z0-9]/g, '');
    const path = `${userId}/workouts/${date}/${Date.now()}-${index + 1}.${ext}`;
    const { error: upErr } = await supabase.storage.from('proofs').upload(path, file, { contentType: file.type });
    setUploading(false);
    if (upErr) { setError(friendlyError(upErr)); return; }
    setW((x) => ({ ...x, media_path: path, exception_note: null, status: undefined }));
    setAskMentor(false);
  }

  function save() {
    if (!w.workout_type) return setError('Pick what kind of workout it was.');
    if (!(w.minutes >= 30)) return setError('A workout needs to be 30 minutes or more.');
    if (!w.media_path && !(askMentor && w.exception_note?.trim())) {
      return setError('Add a photo or clip, or ask your mentor for an exception.');
    }
    onSave({ ...w, exception_note: w.media_path ? null : w.exception_note?.trim() ?? null });
  }

  return (
    <>
      <QuestionCard goal={goal} title="What workout?" eyebrow={`Workout ${index + 1} of ${total}`} />
      <div className="chips">
        {WORKOUT_TYPES.map((t) => (
          <button key={t} type="button" className={`chip ${w.workout_type === t ? 'on' : ''}`}
            onClick={() => setW({ ...w, workout_type: t })}>{t}</button>
        ))}
      </div>
      <label className="field inline pad">
        <span>Minutes</span>
        <input type="number" inputMode="numeric" min={30} placeholder="30+" value={w.minutes || ''}
          onChange={(e) => setW({ ...w, minutes: Number(e.target.value) })} />
      </label>
      {w.minutes > 0 && w.minutes < 30 && <p className="error pad">Under 30 minutes doesn't count as a workout.</p>}

      {w.media_path ? (
        <div className="media-picked">
          <MediaThumb path={w.media_path} />
          <div className="stack tight grow">
            <strong>{rejected && w.media_path === value.media_path ? 'Rejected by your mentor' : 'Proof attached'}</strong>
            <label className="link">Replace
              <input type="file" accept="image/*,video/*" hidden onChange={(e) => pickMedia(e.target.files?.[0])} />
            </label>
          </div>
        </div>
      ) : !askMentor ? (
        <label className="file-drop paper">
          <input type="file" accept="image/*,video/*" onChange={(e) => pickMedia(e.target.files?.[0])} />
          <Icon name="camera" />
          <span>{uploading ? 'Uploading…' : 'Add a photo or clip of this workout'}</span>
        </label>
      ) : (
        <label className="field pad">
          <span>No photo? Tell your mentor why. It counts only if they accept.</span>
          <textarea rows={3} value={w.exception_note ?? ''} onChange={(e) => setW({ ...w, exception_note: e.target.value })} />
        </label>
      )}
      <p className="hint pad">Snap a photo of yourself while you're working out. It's accountability.</p>
      {!w.media_path && (
        <button type="button" className="link muted" onClick={() => setAskMentor((a) => !a)}>
          {askMentor ? 'Attach a photo instead' : 'No photo? Ask your mentor'}
        </button>
      )}

      <ErrorText>{error}</ErrorText>
      <div className="row gap">
        <button type="button" className="btn grow" onClick={onBack}>Back</button>
        <button type="button" className="btn primary grow" onClick={save} disabled={uploading}>
          {index + 1 < total ? 'Next workout' : 'Next'}
        </button>
      </div>
    </>
  );
}

function GoalQuestion({ goal, answer, onAnswer, onAnswerAndNext, onNext }: {
  goal: Goal; answer?: Answer;
  onAnswer: (a: Answer) => void; onAnswerAndNext: (a: Answer) => void; onNext: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (goal.goal_type === 'percentage') inputRef.current?.focus(); }, [goal.goal_type]);

  if (goal.goal_type === 'percentage') {
    return (
      <>
        <QuestionCard goal={goal} title={goal.prompt} />
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

  return (
    <>
      <QuestionCard goal={goal} title={goal.prompt} />
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

function formatWorkouts(w: Workout[] | null) {
  if (w == null) return '—';
  if (w.length === 0) return 'None';
  const asks = w.filter((x) => !x.media_path).length;
  return `${w.length} workout${w.length === 1 ? '' : 's'}${asks ? ` (${asks} for mentor)` : ''}`;
}

function Done({ score, edited, rank, sex, home }: {
  score: WeeklyScore | null; edited: boolean; rank: { before: number; after: number } | null; sex: Sex | null; home: string;
}) {
  return (
    <main className="screen">
      <div className="linked" style={{ flex: 1 }}>
        <section className="card" style={{ alignItems: 'flex-start' }}>
          <div className="done-mark"><Icon name="check" size={44} /></div>
          <h1 className="q-text">{edited ? 'Updated.' : 'Locked in.'}</h1>
        </section>
        {score && (
          <section className="card" style={{ flex: 1 }}>
            <p className="stat-label">This week</p>
            <p className="big-number">{Math.round(Number(score.total_points))}<span className="of">/ 1,049</span></p>
            <p className="muted">
              {score.is_top_this_week ? "You're the most consistent in the cohort right now."
                : `You're #${score.consistency_rank} in the cohort.`}
            </p>
          </section>
        )}
        {rank && home === '/' && <RankCard points={rank.after} from={rank.before} sex={sex} />}
      </div>
      <div className="row gap">
        <Link to="/board" className="btn grow">Leaderboard</Link>
        <Link to={home} className="btn primary grow">Done</Link>
      </div>
    </main>
  );
}

type Challenge = NonNullable<TodayContext['challenge']>;

/** Today's personal challenge. "Yes" needs a photo or clip before it counts. */
function BonusStep({ challenge, date, userId, value, onChallenge, onPick, onNext }: {
  challenge: Challenge; date: string; userId: string; value: boolean | null;
  onChallenge: (c: Challenge) => void; onPick: (v: boolean, advance: boolean) => void; onNext: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const proofRef = useRef<HTMLDivElement>(null);
  const rejected = challenge.review_status === 'rejected';
  // After "Yes", bring the photo box into view (it's below the fold on phones)
  useEffect(() => {
    if (value === true && !(challenge.photo_path && !rejected)) {
      setTimeout(() => proofRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
    }
  }, [value, challenge.photo_path, rejected]);
  const hasPhoto = !!challenge.photo_path && !rejected;

  async function pickMedia(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_MB * 1024 * 1024) { setError(`Files must be under ${MAX_MB} MB.`); return; }
    setError(''); setUploading(true);
    const ext = (file.name.split('.').pop() || (file.type.startsWith('video') ? 'mp4' : 'jpg')).toLowerCase().replace(/[^a-z0-9]/g, '');
    const path = `${userId}/bonus/${date}/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from('proofs').upload(path, file, { contentType: file.type });
    if (upErr) { setUploading(false); setError(friendlyError(upErr)); return; }
    const { error: rpcErr } = await supabase.rpc('set_bonus_photo', { p_path: path });
    setUploading(false);
    if (rpcErr) { setError(friendlyError(rpcErr)); return; }
    onChallenge({ ...challenge, photo_path: path, review_status: null, review_note: null });
  }

  return (
    <>
      <section className="card q-card">
        <div className="row between">
          <span className="goal-icon"><Icon name="bolt" /></span>
          <span className="level">+{challenge.point_value} pts</span>
        </div>
        <div className="stack tight">
          <p className="eyebrow">Your challenge today{challenge.category ? ` · ${challenge.category}` : ''}</p>
          <h1 className="q-text">{challenge.description}</h1>
          {challenge.photo_hint && <p className="small muted"><Icon name="camera" size={14} /> Photo: {challenge.photo_hint}</p>}
        </div>
      </section>
      <p className="muted center-text">Did you complete it?</p>
      <YesNo value={value} onPick={(v) => onPick(v, !v || hasPhoto)} />

      {value === true && (
        <div ref={proofRef} className="stack">
          {rejected && (
            <div className="notice red">
              <strong>Your mentor rejected this photo</strong>
              {challenge.review_note && <p>{challenge.review_note}</p>}
              <p>Add a new photo or clip for it to count.</p>
            </div>
          )}
          {hasPhoto ? (
            <div className="media-picked">
              <MediaThumb path={challenge.photo_path!} />
              <div className="stack tight grow">
                <strong>Proof attached</strong>
                <label className="link">Replace
                  <input type="file" accept="image/*,video/*" hidden onChange={(e) => pickMedia(e.target.files?.[0])} />
                </label>
              </div>
            </div>
          ) : (
            <label className="file-drop paper">
              <input type="file" accept="image/*,video/*" onChange={(e) => pickMedia(e.target.files?.[0])} />
              <Icon name="camera" />
              <span>{uploading ? 'Uploading…' : 'Add a photo or clip to count it'}</span>
            </label>
          )}
          <ErrorText>{error}</ErrorText>
          {!hasPhoto && <p className="hint center-text">It only counts with a photo or clip.</p>}
          <button type="button" className="btn primary block" disabled={!hasPhoto || uploading} onClick={onNext}>Next</button>
        </div>
      )}
    </>
  );
}
