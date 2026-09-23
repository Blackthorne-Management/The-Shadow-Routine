import { supabase } from '../lib/supabase';
import { MONTH_WEEKS, ULTRA_TIERS } from '../lib/goals';
import { formatDay } from '../lib/dates';
import type { MonthStatus, MonthlyResult, Reward } from '../lib/types';
import { Icon } from './Icon';

// Month 1 includes the two prep weeks, so "Week 3 of 4" there is program week 1
const weekLabel = (m: number, w: number | null | undefined) =>
  w == null ? `Week – of 4` : m !== 1 ? `Week ${w} of 4` : w <= 2 ? `Prep week ${w}` : `Prep done · week ${w - 2} of 2`;

/** "Month 2 · Week 3 of 4": Gold Month progress per goal, rewards, past months. */
export default function MonthPanel({ month, rewards, results, onChange }: {
  month: MonthStatus | null; rewards: Reward[]; results: MonthlyResult[]; onChange: () => void;
}) {
  if (!month || month.status === 'unset') return null;

  async function claim(id: string) {
    await supabase.rpc('claim_reward', { p_id: id });
    onChange();
  }

  return (
    <>
      {month.status === 'prep' && (
        <section className="card">
          <p className="stat-label">Prep weeks</p>
          <p className="muted">
            Program week 1 starts {formatDay(month.start_date!)}. Both prep weeks count as green weeks
            at 100% of your targets, so everyone starts Month 1 at the same spot.
          </p>
        </section>
      )}

      {month.status === 'active' && month.month && (
        <section className="card month-card">
          <div className="row between">
            <div>
              <p className="eyebrow">Program week {month.program_week} of 10 · {MONTH_WEEKS[month.month]}</p>
              <p className="stat-label">Month {month.month} · {weekLabel(month.month, month.week_of_month)}</p>
            </div>
            <span className="level gold">Gold Month</span>
          </div>
          <p className="stat-sub">
            Gold needs the monthly total, 3+ green weeks, at most 1 gray and no red. A weak week can be made up later in the month.
          </p>
          <ul className="month-goals">
            {month.goals.map((g) => {
              const pct = Math.min(100, (Number(g.month_total) / Number(g.gold_target)) * 100);
              return (
                <li key={g.category}>
                  <div className="row between">
                    <span className="cat-label grow">{g.label}</span>
                    <span className="cat-pts">{Number(g.month_total)}<small>/{Number(g.gold_target)}</small></span>
                  </div>
                  <div className="month-weeks" aria-label="Weeks this month">
                    {g.weeks.map((w) => (
                      <span key={w.label} title={`${w.label}: ${w.band ?? 'not started'}`}
                        className={`wk band-${w.band ?? 'none'} ${w.state}`}>{w.state === 'prep' ? 'P' : w.label.replace('Week ', '')}</span>
                    ))}
                    <div className="bar grow"><div className="bar-fill" style={{ width: `${pct}%` }} /></div>
                  </div>
                  <p className={`small ${g.gold_status === 'lost' ? 'pace-red' : 'gold-text'}`}>
                    {g.gold_status === 'lost'
                      ? (g.reds > 0 ? 'A red week ruled out Gold this month' : 'Two gray weeks ruled out Gold this month')
                      : `Gold on track${g.gold_reward ? ` → ${g.gold_reward}` : ''}`}
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {rewards.length > 0 && (
        <section className="stack">
          <h2 className="section-title">Rewards earned</h2>
          <ul className="list">
            {rewards.map((r) => (
              <li key={r.id} className="list-row">
                <span className="goal-icon sm gold"><Icon name={r.kind === 'ultra_wish' ? 'crown' : 'other'} /></span>
                <div className="grow">
                  <strong style={{ fontWeight: 500 }}>{r.description}</strong>
                  <p className="small muted">
                    {r.kind === 'gold_month' ? `Gold Month ${r.month_number}` : r.kind === 'three_gold' ? '3 Gold Months' : `Ultra Gold Month ${r.month_number}`}
                    {' · '}grant yourself!
                  </p>
                </div>
                {r.claimed_at
                  ? <span className="pill green">Claimed</span>
                  : <button className="btn small" onClick={() => claim(r.id)}>Mark claimed</button>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {results.length > 0 && (
        <section className="stack">
          <h2 className="section-title">Month results</h2>
          {results.map((m) => {
            const tier = ULTRA_TIERS[m.ultra_tier];
            return (
              <div key={m.id} className={`tier-card tier-${m.ultra_tier}`}>
                <div className="row between">
                  <strong>Month {m.month_number}: {tier.name}</strong>
                  <span className="small">{Math.round(Number(m.avg_pct))}% avg</span>
                </div>
                <p className="small">{tier.message}</p>
                <p className="small">
                  Gold Months: {Object.values(m.goals).filter((g) => g?.gold).map((g) => g!.label).join(', ') || 'none'}
                </p>
              </div>
            );
          })}
        </section>
      )}
    </>
  );
}
