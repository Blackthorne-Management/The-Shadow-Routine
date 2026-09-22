import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { CATEGORY_NAMES, THEME_ICONS, describeTarget } from '../lib/goals';
import { formatDay, formatWeek } from '../lib/dates';
import type { Infraction, Punishment, TodayContext, WeeklyScore } from '../lib/types';
import { ProgressBar, Splash } from '../components/ui';

export default function Home() {
  const { profile, goals } = useAuth();
  const [today, setToday] = useState<TodayContext | null>(null);
  const [score, setScore] = useState<WeeklyScore | null>(null);
  const [cohortSize, setCohortSize] = useState(0);
  const [punishments, setPunishments] = useState<Punishment[]>([]);
  const [notices, setNotices] = useState<Infraction[]>([]);

  const load = useCallback(async () => {
    if (!profile) return;
    const { data: ctx } = await supabase.rpc('today_context');
    const t = ctx as TodayContext;
    setToday(t);
    const [s, n, p, i] = await Promise.all([
      supabase.from('weekly_scores').select('*').eq('user_id', profile.id).eq('week_start_date', t.week_start).maybeSingle(),
      supabase.from('weekly_scores').select('id', { count: 'exact', head: true }).eq('week_start_date', t.week_start),
      supabase.from('punishments').select('*').eq('user_id', profile.id).neq('proof_status', 'accepted').order('created_at', { ascending: false }),
      supabase.from('infractions').select('*').eq('user_id', profile.id).is('acknowledged_at', null),
    ]);
    if (!s.data) await supabase.rpc('refresh_current_week');
    setScore((s.data as WeeklyScore) ?? null);
    setCohortSize(n.count ?? 0);
    setPunishments((p.data as Punishment[]) ?? []);
    setNotices((i.data as Infraction[]) ?? []);
  }, [profile]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    // Rank moves when anyone checks in
    const ch = supabase.channel('home-scores')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'weekly_scores' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  if (!today || !profile) return <Splash />;

  const logged = today.entries.length > 0;
  const first = profile.display_name.split(' ')[0];

  async function acknowledge(id: string) {
    await supabase.rpc('acknowledge_infraction', { p_id: id });
    setNotices((n) => n.filter((x) => x.id !== id));
  }

  return (
    <main className="screen with-tabs">
      <header className="page-header">
        <div>
          <p className="eyebrow">{formatDay(today.date)}</p>
          <h1>Hey, {first}</h1>
        </div>
      </header>

      {notices.map((n) => (
        <div key={n.id} className="notice red">
          <strong>{n.infraction_number === 1 ? 'Infraction logged — talk to your mentor' : `Infraction #${n.infraction_number}`}</strong>
          <p>
            {n.infraction_number === 1
              ? "Your punishment proof wasn't accepted. This is a warning: set up a conversation with your mentor."
              : 'A second infraction puts your spot in the cohort under review. Your mentor will reach out.'}
          </p>
          <button className="btn small ghost" onClick={() => acknowledge(n.id)}>Got it</button>
        </div>
      ))}

      <Link to="/checkin" className={`checkin-cta ${logged ? 'done' : ''}`}>
        {logged ? (
          <>
            <span className="cta-icon">✓</span>
            <div>
              <strong>Today's logged</strong>
              <span>Tap to edit (until midnight)</span>
            </div>
          </>
        ) : (
          <>
            <span className="cta-icon">→</span>
            <div>
              <strong>Log today</strong>
              <span>5 goals + bonus · under 2 minutes</span>
            </div>
          </>
        )}
      </Link>

      <section className="card score-card">
        <div className="score-top">
          <div>
            <p className="eyebrow">This week · {formatWeek(today.week_start)}</p>
            <div className="big-number">
              {Math.round(Number(score?.total_points ?? 0))}
              <span className="of">/ 1,049</span>
            </div>
          </div>
          <Link to="/board" className="rank-badge">
            {score?.is_top_this_week && <span className="crown" aria-label="Most consistent">👑</span>}
            <span className="rank-num">#{score?.consistency_rank ?? '–'}</span>
            <span className="rank-of">of {cohortSize || '–'}</span>
          </Link>
        </div>
        {score?.is_top_this_week && <p className="top-line">You're the most consistent in the cohort this week.</p>}

        <ul className="cat-list">
          {goals.map((g) => {
            const cs = score?.category_scores?.[g.category];
            const pct = cs?.pct ?? 0;
            const actual = Number(cs?.actual ?? 0);
            return (
              <li key={g.id}>
                <div className="cat-row">
                  <span className="goal-icon sm">{THEME_ICONS[g.theme]}</span>
                  <span className="grow cat-label">{g.label}</span>
                  <span className="cat-pts">{Math.round(Number(cs?.points ?? 0))}<small>/{g.category_point_max}</small></span>
                </div>
                <ProgressBar pct={pct} band={cs?.band} />
                <p className="small muted">
                  {actual} of {describeTarget(g)}
                  <span className="sr-only"> · {CATEGORY_NAMES[g.category]}</span>
                </p>
              </li>
            );
          })}
        </ul>
        <div className="bonus-line">
          <span>⚡ Bonus</span>
          <span>{score?.bonus_points ?? 0}<small>/49</small></span>
        </div>
      </section>

      {punishments.length > 0 && (
        <section>
          <h2 className="section-title">Punishments</h2>
          <ul className="list">
            {punishments.map((p) => (
              <li key={p.id}>
                <Link to={`/punishment/${p.id}`} className="list-row link-row">
                  <span className={`status-dot ${p.proof_status}`} />
                  <div className="grow">
                    <strong>{p.punishment_description}</strong>
                    <p className="small muted">
                      {p.proof_status === 'rejected' ? 'Proof rejected — resubmit'
                        : p.proof_submitted_at ? 'Proof submitted · awaiting review'
                        : 'Proof needed'} · week of {formatDay(p.week_start_date, { month: 'short', day: 'numeric' })}
                    </p>
                  </div>
                  <span aria-hidden>›</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="legend small muted">
        Bands: <span className="dot band-green" /> 80%+ <span className="dot band-gray" /> 60–79% <span className="dot band-red" /> under 60%
        — a red band at week's end means a punishment.
      </p>
    </main>
  );
}
