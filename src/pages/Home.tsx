import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { describeTarget } from '../lib/goals';
import { addDays, formatDay, formatWeek, timeLeftToday } from '../lib/dates';
import type { Band, Infraction, MonthStatus, MonthlyResult, Punishment, Reward, TodayContext, WeeklyScore } from '../lib/types';
import MonthPanel from '../components/MonthPanel';
import { ProgressBar, Splash, TickMeter, TopBar } from '../components/ui';
import { Icon, ThemeIcon } from '../components/Icon';

const PACE_TEXT: Record<Band, string> = { green: 'On track', gray: 'Behind: catch up', red: 'Behind pace' };
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function Home() {
  const { profile, goals } = useAuth();
  const [today, setToday] = useState<TodayContext | null>(null);
  const [score, setScore] = useState<WeeklyScore | null>(null);
  const [cohortSize, setCohortSize] = useState(0);
  const [daily, setDaily] = useState<Record<string, number>>({});
  const [punishments, setPunishments] = useState<Punishment[]>([]);
  const [notices, setNotices] = useState<Infraction[]>([]);
  const [month, setMonth] = useState<MonthStatus | null>(null);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [results, setResults] = useState<MonthlyResult[]>([]);

  const load = useCallback(async () => {
    if (!profile) return;
    const { data: ctx } = await supabase.rpc('today_context');
    const t = ctx as TodayContext;
    setToday(t);
    const [s, n, e, p, i, m, r, mr] = await Promise.all([
      supabase.from('weekly_scores').select('*').eq('user_id', profile.id).eq('week_start_date', t.week_start).maybeSingle(),
      supabase.from('weekly_scores').select('id', { count: 'exact', head: true }).eq('week_start_date', t.week_start),
      supabase.from('daily_entries').select('entry_date,value_reported').eq('user_id', profile.id)
        .gte('entry_date', t.week_start).lte('entry_date', addDays(t.week_start, 6)),
      supabase.from('punishments').select('*').eq('user_id', profile.id).neq('proof_status', 'accepted').order('created_at', { ascending: false }),
      supabase.from('infractions').select('*').eq('user_id', profile.id).is('acknowledged_at', null),
      supabase.rpc('month_status'),
      supabase.from('rewards').select('*').eq('user_id', profile.id).order('created_at', { ascending: false }),
      supabase.from('monthly_results').select('*').eq('user_id', profile.id).order('month_number', { ascending: false }),
    ]);
    setMonth((m.data as MonthStatus) ?? null);
    setRewards((r.data as Reward[]) ?? []);
    setResults((mr.data as MonthlyResult[]) ?? []);
    setScore((s.data as WeeklyScore) ?? null);
    setCohortSize(n.count ?? 0);
    // Goals with progress, per day of the week
    const perDay: Record<string, number> = {};
    for (const row of e.data ?? []) if (Number(row.value_reported) > 0) perDay[row.entry_date] = (perDay[row.entry_date] ?? 0) + 1;
    setDaily(perDay);
    setPunishments((p.data as Punishment[]) ?? []);
    setNotices((i.data as Infraction[]) ?? []);
  }, [profile]);

  useEffect(() => {
    // Recompute once on open so pace colors reflect today, then load
    supabase.rpc('refresh_current_week').then(() => load());
    // Rank moves when anyone checks in
    const ch = supabase.channel('home-scores')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'weekly_scores' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  if (!today || !profile) return <Splash />;

  const logged = today.entries.length > 0;
  const open = today.program.status === 'active' || today.program.status === 'unset';
  const first = profile.display_name.split(' ')[0];
  const total = Number(score?.total_points ?? 0);

  async function acknowledge(id: string) {
    await supabase.rpc('acknowledge_infraction', { p_id: id });
    setNotices((n) => n.filter((x) => x.id !== id));
  }

  return (
    <main className="screen with-tabs">
      <TopBar pill={score?.consistency_rank ? `#${score.consistency_rank} rank` : formatDay(today.date, { weekday: 'short' })} />

      <div className="linked">
        <section className="card">
          <p className="hello">{first}, <span>welcome back</span></p>
        </section>
        <section className="card">
          <div>
            <p className="stat-label">This week</p>
            <p className="stat-sub">{formatWeek(today.week_start)} · don't skip your check-ins.</p>
          </div>
          <div className="meter">
            <span className="big-number">{Math.round(total)}</span>
            <TickMeter pct={(total / 1049) * 100} />
          </div>
          {score?.is_top_this_week && (
            <p className="row gap" style={{ color: 'var(--lav)' }}><Icon name="crown" size={16} /> Most consistent in the cohort this week</p>
          )}
        </section>
      </div>

      {notices.map((n) => (
        <div key={n.id} className="notice red">
          <strong>{n.infraction_number === 1 ? 'Infraction logged: talk to your mentor' : `Infraction #${n.infraction_number}`}</strong>
          <p>
            {n.infraction_number === 1
              ? "Your punishment proof wasn't accepted. This is a warning: set up a conversation with your mentor."
              : 'Another infraction puts your spot in the cohort under review. Your mentor will reach out.'}
          </p>
          <button className="btn small" onClick={() => acknowledge(n.id)}>Got it</button>
        </div>
      ))}

      {open ? (
      <section className="today-block">
        <p className="eyebrow" style={{ color: 'var(--ink)', fontSize: 14 }}>Tonight's check-in</p>
        <div className="today-row">
          <div className="stack tight">
            <span className="pill dark" style={{ alignSelf: 'flex-start' }}>{timeLeftToday(profile.timezone)}</span>
            <span className="today-title">{logged ? 'Logged. Edit until midnight' : '5 goals + bonus'}</span>
          </div>
          <Link to="/checkin" className={`btn square ${logged ? '' : 'primary'}`}>{logged ? 'Edit' : 'Start'}</Link>
        </div>
      </section>
      ) : (
        <section className="today-block">
          <p className="eyebrow" style={{ color: 'var(--ink)', fontSize: 14 }}>
            {today.program.status === 'ended' ? 'Program complete' : 'Prep weeks'}
          </p>
          <span className="today-title">
            {today.program.status === 'ended'
              ? 'The 12 weeks are done. Your history stays here.'
              : `Check-ins open ${formatDay(today.program.start_date!)}`}
          </span>
        </section>
      )}

      <div className="pair">
        <section className="card">
          <p className="stat-label">Rank</p>
          <p className="stat-sub">Out of {cohortSize || '–'}</p>
          <p className="stat-value">#{score?.consistency_rank ?? '–'}</p>
        </section>
        <section className="card">
          <p className="stat-label">Bonus</p>
          <p className="stat-sub">Daily challenges</p>
          <p className="stat-value">{score?.bonus_points ?? 0}<span className="of">/ 49</span></p>
        </section>
      </div>

      <section className="card">
        <div className="row between">
          <div>
            <p className="stat-label">Your goals</p>
            <p className="stat-sub">Color shows your pace for the week so far</p>
          </div>
        </div>
        <ul className="cat-list">
          {goals.map((g) => {
            const cs = score?.category_scores?.[g.category];
            const pace = cs?.pace_band ?? null;
            return (
              <li key={g.id}>
                <div className="cat-row">
                  <span className="goal-icon sm"><ThemeIcon theme={g.theme} /></span>
                  <span className="grow cat-label">{g.label}</span>
                  <span className="cat-pts">{Math.round(Number(cs?.points ?? 0))}<small>/{g.category_point_max}</small></span>
                </div>
                <ProgressBar pct={cs?.pct ?? 0} band={pace} />
                <div className="cat-meta">
                  <span>{Number(cs?.actual ?? 0)} of {describeTarget(g)}</span>
                  <span className={pace ? `pace-${pace}` : ''}>{pace ? PACE_TEXT[pace] : 'Counts after your first log'}</span>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <MonthPanel month={month} rewards={rewards} results={results} onChange={load} />

      <section className="card">
        <div>
          <p className="stat-label">Your week</p>
          <p className="stat-sub">Goals with progress each day</p>
        </div>
        <div className="week-chart">
          {DAYS.map((d, i) => {
            const date = addDays(today.week_start, i);
            const n = daily[date] ?? 0;
            return (
              <div key={d} className={`week-col ${date === today.date ? 'today' : ''}`}>
                <div className="week-slot"><div className="week-fill" style={{ height: `${(n / Math.max(goals.length, 1)) * 100}%` }} /></div>
                <span>{d}</span>
              </div>
            );
          })}
        </div>
        <Link to="/board" className="btn primary block">View leaderboard</Link>
      </section>

      {punishments.length > 0 && (
        <section className="stack">
          <h2 className="section-title">Punishments</h2>
          <ul className="list">
            {punishments.map((p) => (
              <li key={p.id}>
                <Link to={`/punishment/${p.id}`} className="list-row link-row">
                  <span className={`status-dot ${p.proof_status}`} />
                  <div className="grow">
                    <p className="small muted">{p.kind === 'ultra' ? 'Ultra Punishment' : `Red week · ${goals.find((g) => g.category === p.category)?.label ?? ''}`}</p>
                    <strong style={{ fontWeight: 500 }}>{p.punishment_description}</strong>
                    <p className="small muted">
                      {p.proof_status === 'rejected' ? 'Proof rejected: resubmit'
                        : p.proof_submitted_at ? 'Proof submitted · awaiting review'
                        : 'Proof needed'} · week of {formatDay(p.week_start_date, { month: 'short', day: 'numeric' })}
                    </p>
                  </div>
                  <Icon name="chevron" size={18} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="legend small muted">
        <span className="dot band-green" /> on track <span className="dot band-gray" /> behind, catch up <span className="dot band-red" /> red week (final).
        Mid-week you're never red. A week that closes under 60% of a target triggers that goal's punishment.
      </p>
    </main>
  );
}
