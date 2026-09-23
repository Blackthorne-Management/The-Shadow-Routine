import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { localDate } from '../lib/dates';
import { ADVANCE_FROM_R1, buildBracket, type Bracket, type BracketCohort, type Match, type Round, type Score } from '../lib/ultimate';
import { Icon } from '../components/Icon';
import { TopBar } from '../components/ui';

/** A cohort's seal: its emblem art, or a placeholder with its initial. */
export function CohortEmblem({ c, size = 36 }: { c: BracketCohort | null; size?: number }) {
  const box = { width: size, height: size, minWidth: size, minHeight: size };
  if (c?.emblem_url) return <img className="cohort-emblem" src={c.emblem_url} style={box} alt="" />;
  return (
    <span className={`cohort-emblem placeholder ${c ? '' : 'tbd'}`} style={{ ...box, fontSize: size * 0.42 }} aria-hidden>
      {c ? c.name.charAt(0) : '?'}
    </span>
  );
}

const fmt = (s: Score | null) => (s?.score == null ? '–' : Math.round(s.score).toString());

function MatchCard({ m, round, mine }: { m: Match; round: Round; mine: string | null }) {
  const side = (c: BracketCohort | null, s: Score | null) => {
    const lead = !!c && m.leader === c.id && round.status !== 'upcoming';
    const out = !!c && round.status === 'done' && m.leader !== c.id;
    return (
      <div className={`ult-side ${lead ? 'lead' : ''} ${out ? 'out' : ''} ${c && c.id === mine ? 'mine' : ''}`}>
        <CohortEmblem c={c} size={26} />
        <span className="grow ult-name">{c?.name ?? 'TBD'}</span>
        <span className="ult-score">{c ? fmt(s) : ''}</span>
      </div>
    );
  };
  return (
    <div className="ult-match">
      {side(m.a, m.aScore)}
      {side(m.b, m.bScore)}
    </div>
  );
}

function RoundHead({ r, note }: { r: Round; note?: string }) {
  const label = r.status === 'live' ? 'Live' : r.status === 'done' ? 'Final' : 'Upcoming';
  return (
    <div className="ult-round-head">
      <h2>{r.name}</h2>
      <span className="small muted">Weeks {r.weeks[0]}–{r.weeks[1]}{note ? ` · ${note}` : ''}</span>
      <span className={`pill ${r.status === 'live' ? 'red' : ''}`}>{label}</span>
    </div>
  );
}

/** The Ultimate Shadow: every cohort in one bracket over the 10 program weeks. */
export default function Ultimate() {
  const { profile } = useAuth();
  const [bracket, setBracket] = useState<Bracket | null>(null);
  const [showRules, setShowRules] = useState(false);

  useEffect(() => {
    let live = true;
    const load = async () => {
      const [{ data: cohorts }, { data: members }, { data: program }] = await Promise.all([
        supabase.from('cohorts').select('id,name,emblem_url,created_at').order('created_at'),
        supabase.from('profiles').select('id,cohort_id,role,status'),
        supabase.from('program_settings').select('start_date').eq('id', 1).maybeSingle(),
      ]);
      const start = (program?.start_date as string | null) ?? null;
      const { data: weeks } = start
        ? await supabase.from('weekly_scores').select('user_id,week_start_date,total_points,band_per_category').gte('week_start_date', start)
        : { data: [] };
      if (!live) return;
      setBracket(buildBracket((cohorts ?? []) as BracketCohort[], weeks ?? [], members ?? [], start,
        localDate(profile?.timezone ?? 'UTC')));
    };
    load();
    const ch = supabase.channel('ultimate')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'weekly_scores' }, () => load())
      .subscribe();
    return () => { live = false; supabase.removeChannel(ch); };
  }, [profile?.timezone]);

  if (!bracket) return <main className="screen with-tabs"><TopBar pill="Ultimate" /><div className="skeleton-list" /></main>;

  const [r1, qf, sf, fin] = bracket.rounds;
  const mine = profile?.cohort_id ?? null;
  const liveRound = bracket.rounds.find((r) => r.status === 'live');
  const stage = bracket.champion ? 'Champion crowned'
    : liveRound ? `${liveRound.name} · week ${bracket.currentWeek - liveRound.weeks[0] + 1} of ${liveRound.weeks[1] - liveRound.weeks[0] + 1}`
      : bracket.currentWeek === 0 ? 'Starts program week 1' : 'Between rounds';

  return (
    <main className="screen with-tabs ultimate">
      <TopBar pill="Ultimate" />
      <section className="card ult-hero">
        <Link to="/board" className="link small">‹ Leaderboard</Link>
        <p className="eyebrow">The Ultimate Shadow</p>
        <h1>{stage}</h1>
        <p className="small muted">{bracket.r1.length} cohorts. Scores are average points per member per week, so a cohort's size doesn't matter.</p>
      </section>

      <section className="ult-champion">
        <Icon name="crown" size={22} />
        {bracket.champion
          ? <><CohortEmblem c={bracket.champion} size={64} /><h2>{bracket.champion.name}</h2><p className="small muted">The Ultimate Shadow</p></>
          : <><CohortEmblem c={null} size={64} /><h2>To be decided</h2><p className="small muted">After week 10</p></>}
      </section>

      <section className="ult-round">
        <RoundHead r={fin} note="the last two" />
        <MatchCard m={bracket.final} round={fin} mine={mine} />
      </section>

      <section className="ult-round">
        <RoundHead r={sf} />
        <div className="ult-grid two">{bracket.sf.map((m, i) => <MatchCard key={i} m={m} round={sf} mine={mine} />)}</div>
      </section>

      <section className="ult-round">
        <RoundHead r={qf} note="1v8 · 4v5 · 2v7 · 3v6" />
        <div className="ult-grid two">{bracket.qf.map((m, i) => <MatchCard key={i} m={m} round={qf} mine={mine} />)}</div>
      </section>

      <section className="ult-round">
        <RoundHead r={r1} note={`top ${ADVANCE_FROM_R1} move on`} />
        <ol className="ult-field">
          {bracket.r1.map((s) => (
            <li key={s.cohort.id} className={`ult-tile ${s.advancing ? 'advancing' : r1.status !== 'upcoming' ? 'out' : ''} ${s.cohort.id === mine ? 'mine' : ''}`}>
              <span className="ult-rank">{r1.status === 'upcoming' ? '' : s.rank}</span>
              <CohortEmblem c={s.cohort} size={34} />
              <span className="ult-tile-name">{s.cohort.name}</span>
              <span className="ult-score">{fmt(s)}</span>
            </li>
          ))}
        </ol>
        {r1.status === 'live' && <p className="small muted center-text">Red = moving on if Round 1 ended now.</p>}
      </section>

      <section className="card">
        <button className="row between link-row" style={{ background: 'none', border: 0, padding: 0, width: '100%' }} onClick={() => setShowRules((v) => !v)}>
          <h2>How it works</h2><span aria-hidden>{showRules ? '−' : '+'}</span>
        </button>
        {showRules && (
          <ul className="steps small">
            <li>A cohort's score is the average of its members' weekly points (out of 1,049) over the round. Mentors don't count.</li>
            <li><b>Round 1</b> (weeks 1–2): every cohort. The top {ADVANCE_FROM_R1} move on.</li>
            <li><b>Quarterfinals</b> (weeks 3–4): seeded by Round 1, 1 vs 8, 2 vs 7, 3 vs 6, 4 vs 5. Higher score moves on.</li>
            <li><b>Semifinals</b> (weeks 5–6): the four winners.</li>
            <li><b>The Final</b> (weeks 7–10): the last two. The winner is The Ultimate Shadow.</li>
            <li>Each round starts fresh. Ties go to more green categories.</li>
          </ul>
        )}
      </section>
    </main>
  );
}
