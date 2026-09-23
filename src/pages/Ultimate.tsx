import { Fragment, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { localDate } from '../lib/dates';
import { CUT_WEEKS, GREEN_WEEK, buildBracket, type Bracket, type Contender, type Stage, type Standing } from '../lib/ultimate';
import { titleFor } from '../lib/ranks';
import Emblem from '../components/Emblem';
import { Icon } from '../components/Icon';
import { TopBar } from '../components/ui';

interface CohortRow { id: string; name: string; emblem_url: string | null }

/** A cohort's seal: its emblem art, or a placeholder with its initial. */
export function CohortEmblem({ c, size = 36 }: { c: { name: string; emblem_url: string | null } | null; size?: number }) {
  const box = { width: size, height: size, minWidth: size, minHeight: size };
  if (c?.emblem_url) return <img className="cohort-emblem" src={c.emblem_url} style={box} alt="" />;
  return (
    <span className={`cohort-emblem placeholder ${c ? '' : 'tbd'}`} style={{ ...box, fontSize: size * 0.42 }} aria-hidden>
      {c ? c.name.charAt(0) : '?'}
    </span>
  );
}

function Row({ s, cohort, me, showRank }: { s: Standing; cohort: CohortRow | undefined; me: boolean; showRank: boolean }) {
  return (
    <li className={`ult-row ${s.eliminatedWeek ? 'out' : ''} ${me ? 'me' : ''}`}>
      <span className="ult-pos">{showRank ? s.rank : ''}</span>
      <Emblem level={s.person.rank_level} sex={s.person.sex} size={26} />
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="ult-who">
          <strong>{s.person.display_name}</strong>
          {me && <span className="you">you</span>}
        </div>
        <div className="ult-sub">
          <CohortEmblem c={cohort ?? null} size={14} />
          <span className="small muted">{cohort?.name ?? '—'}</span>
          {s.eliminatedWeek && <span className="ult-tag">Eliminated in week {s.eliminatedWeek}</span>}
        </div>
        <div className="ult-weeks" aria-label={`${s.wins} green weeks`}>
          {s.weeks.map((w, i) => <i key={i} className={w} title={`Week ${i + 1}`} />)}
        </div>
      </div>
      <div className="ult-tally">
        <strong>{s.wins}</strong><span className="small muted">{s.wins === 1 ? 'win' : 'wins'}</span>
        <span className="small muted">{s.points.toLocaleString()} pts</span>
      </div>
    </li>
  );
}

/**
 * Bracket view: one column per stage, from the full field on the left down to
 * one on the right. Past cuts are solid; cuts still to come are projected from
 * today's ranking (dashed). In each column, whoever misses the next one is faded.
 */
function BracketView({ stages, me }: { stages: Stage[]; me: string | undefined }) {
  return (
    <section className="ult-round">
      <div className="ult-round-head">
        <h2>Bracket</h2>
        <span className="small muted">scroll sideways · dashed = if it ended now</span>
      </div>
      <div className="ult-bracket">
        {stages.map((st, i) => {
          const next = new Set(stages[i + 1]?.people.map((p) => p.id) ?? []);
          const last = i === stages.length - 1;
          return (
            <div key={st.label} className={`ult-col ${st.done ? 'done' : 'projected'}`}>
              <div className="ult-col-head">
                <strong>{last && st.people.length === 1 ? 'Winner' : st.label}</strong>
                <span className="small muted">{st.people.length}{st.done ? '' : ' · projected'}</span>
              </div>
              <ol className="ult-col-list">
                {st.people.map((p) => (
                  <li key={p.id} className={`ult-chip ${!last && !next.has(p.id) ? 'cut' : ''} ${p.id === me ? 'me' : ''} ${last ? 'final' : ''}`}>
                    <Emblem level={p.rank_level} sex={p.sex} size={16} />
                    <span>{p.display_name.replace(/ \(test\)$/, '')}</span>
                  </li>
                ))}
              </ol>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** The Ultimate Shadow: one bracket of every participant; cohorts stay as they are. */
export default function Ultimate() {
  const { profile } = useAuth();
  const [bracket, setBracket] = useState<Bracket | null>(null);
  const [cohorts, setCohorts] = useState<Map<string, CohortRow>>(new Map());
  const [showRules, setShowRules] = useState(false);
  const [showOut, setShowOut] = useState(false);
  const [view, setView] = useState<'list' | 'bracket'>('list');

  useEffect(() => {
    let live = true;
    const load = async () => {
      const [{ data: c }, { data: people }, { data: program }] = await Promise.all([
        supabase.from('cohorts').select('id,name,emblem_url'),
        supabase.from('profiles').select('id,display_name,cohort_id,sex,rank_level,role,status'),
        supabase.from('program_settings').select('start_date').eq('id', 1).maybeSingle(),
      ]);
      const start = (program?.start_date as string | null) ?? null;
      const { data: rows } = start
        ? await supabase.from('weekly_scores').select('user_id,week_start_date,total_points').gte('week_start_date', start)
        : { data: [] };
      if (!live) return;
      // Everyone in a cohort competes; mentors don't
      const contenders = ((people ?? []) as (Contender & { role: string; status: string })[])
        .filter((p) => p.role === 'participant' && p.status === 'active');
      setCohorts(new Map(((c ?? []) as CohortRow[]).map((x) => [x.id, x])));
      setBracket(buildBracket(contenders, rows ?? [], start, localDate(profile?.timezone ?? 'UTC')));
    };
    load();
    const ch = supabase.channel('ultimate')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'weekly_scores' }, () => load())
      .subscribe();
    return () => { live = false; supabase.removeChannel(ch); };
  }, [profile?.timezone]);

  if (!bracket) return <main className="screen with-tabs"><TopBar pill="Ultimate" /><div className="skeleton-list" /></main>;

  const { inTheRunning, eliminated, schedule, currentWeek, nextCut, keepAtNextCut, winner } = bracket;
  const me = profile?.id;
  const myOut = eliminated.find((s) => s.person.id === me);
  const stage = winner ? 'Winner crowned'
    : currentWeek === 0 ? 'Starts program week 1'
      : currentWeek > 10 ? 'Program complete' : `Week ${currentWeek} · ${inTheRunning.length} in the running`;
  const cutLine = keepAtNextCut ?? inTheRunning.length;

  return (
    <main className="screen with-tabs ultimate">
      <TopBar pill="Ultimate" />
      <section className="card ult-hero">
        <Link to="/board" className="link small">‹ Leaderboard</Link>
        <p className="eyebrow">The Ultimate Shadow</p>
        <h1>{stage}</h1>
        <p className="small muted">
          {nextCut
            ? `Next cut: end of week ${nextCut}. The top ${keepAtNextCut} of ${inTheRunning.length} stay.`
            : winner ? 'One left standing.' : 'No more cuts.'}
          {' '}Ranked by green weeks (80%+ of 1,049); points only break ties.
        </p>
        {myOut && <p className="notice red">You were eliminated in week {myOut.eliminatedWeek}. You're still in your cohort; keep stacking green weeks.</p>}
      </section>

      <section className="ult-champion">
        <Icon name="crown" size={22} />
        {winner
          ? <><Emblem level={winner.person.rank_level} sex={winner.person.sex} size={72} /><h2>{winner.person.display_name}</h2>
            <p className="small muted">The Ultimate Shadow · {titleFor(winner.person.rank_level, winner.person.sex)}</p></>
          : <><CohortEmblem c={null} size={64} /><h2>To be decided</h2><p className="small muted">After week 10</p></>}
      </section>

      <section className="ult-round">
        <div className="ult-round-head"><h2>Cut schedule</h2><span className="small muted">people left after each week</span></div>
        <ol className="ult-schedule">
          {schedule.map((w) => (
            <li key={w.week} className={`${w.cut ? 'cut' : ''} ${w.done ? 'done' : ''} ${w.week === currentWeek ? 'now' : ''}`}>
              <span className="small">W{w.week}</span>
              <strong>{w.after}</strong>
              <span className="tiny">{w.cut ? 'cut' : 'hold'}</span>
            </li>
          ))}
        </ol>
      </section>

      <div className="seg" role="tablist" aria-label="View">
        <button className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}>List</button>
        <button className={view === 'bracket' ? 'on' : ''} onClick={() => setView('bracket')}>Bracket</button>
      </div>

      {view === 'bracket' && <BracketView stages={bracket.stages} me={me} />}

      {view === 'list' && <section className="ult-round">
        <div className="ult-round-head">
          <h2>In the running</h2>
          <span className="small muted">{inTheRunning.length} left</span>
        </div>
        <ol className="ult-list">
          {inTheRunning.map((s, i) => (
            <Fragment key={s.person.id}>
              {nextCut && i === cutLine && (
                <li className="ult-cutline" aria-label="Cut line">
                  <span>Cut line · end of week {nextCut} · if it ended now</span>
                </li>
              )}
              <Row s={s} cohort={cohorts.get(s.person.cohort_id ?? '')} me={s.person.id === me} showRank />
            </Fragment>
          ))}
        </ol>
      </section>}

      {view === 'list' && eliminated.length > 0 && (
        <section className="ult-round">
          <button className="ult-round-head" style={{ background: 'none', border: 0, padding: '0 4px', width: '100%', color: 'inherit' }}
            onClick={() => setShowOut((v) => !v)}>
            <h2>Eliminated</h2><span className="small muted">{eliminated.length}</span>
            <span aria-hidden style={{ marginLeft: 'auto' }}>{showOut ? '−' : '+'}</span>
          </button>
          {showOut && (
            <ol className="ult-list">
              {eliminated.map((s) => (
                <Row key={s.person.id} s={s} cohort={cohorts.get(s.person.cohort_id ?? '')} me={s.person.id === me} showRank={false} />
              ))}
            </ol>
          )}
        </section>
      )}

      <section className="card">
        <button className="row between" style={{ background: 'none', border: 0, padding: 0, width: '100%', color: 'inherit' }} onClick={() => setShowRules((v) => !v)}>
          <h2>How it works</h2><span aria-hidden>{showRules ? '−' : '+'}</span>
        </button>
        {showRules && (
          <ul className="steps small">
            <li>Everyone in every cohort is in one bracket. Your cohort doesn't change: you see all your people for all 10 weeks.</li>
            <li>A <b>checkpoint win</b> is a green week: {Math.round(GREEN_WEEK)}+ of 1,049 points (80%).</li>
            <li>You're ranked by checkpoint wins. Total points only break a tie, so a late spike can't beat someone who's been green all along.</li>
            <li>Cuts at the end of weeks {CUT_WEEKS.join(', ')}: the top half stays, rounded up (25 → 13). Anyone exactly tied at the line stays too.</li>
            <li>Weeks 1, 3 and 5 are breathing weeks with no cut. From week 6 there's a cut every week until one is left.</li>
            <li>If you're cut, you're tagged "eliminated in week X" here only; you stay in your cohort.</li>
          </ul>
        )}
      </section>
    </main>
  );
}
