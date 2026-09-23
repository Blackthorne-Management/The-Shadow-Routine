import { useEffect, useState } from 'react';
import { CYCLE_MAX, LEVELS, levelFor, nextLevel, titleFor } from '../lib/ranks';
import type { Sex } from '../lib/types';
import Emblem from './Emblem';

const fmt = (n: number) => Math.round(n).toLocaleString();

/**
 * Cumulative cycle points toward the next rank. With `from`, the bar starts at
 * the old total and animates up to the new one (after a check-in).
 */
export default function RankCard({ points, sex, name, from }: {
  points: number; sex: Sex | null; name?: string; from?: number;
}) {
  const [shown, setShown] = useState(from ?? points);
  useEffect(() => {
    const start = from ?? points;
    const crossed = levelFor(points) > levelFor(start);
    // Crossing a rank: fill the old bar to the top first, then roll into the new rank
    const cap = crossed ? LEVELS[levelFor(start)].threshold - 0.01 : points;
    const t1 = setTimeout(() => setShown(cap), 250);
    const t2 = crossed ? setTimeout(() => setShown(points), 1700) : undefined;
    return () => { clearTimeout(t1); if (t2) clearTimeout(t2); };
  }, [points, from]);

  const level = levelFor(shown);
  const cur = LEVELS[level - 1];
  const next = nextLevel(level);
  const pct = next ? ((shown - cur.threshold) / (next.threshold - cur.threshold)) * 100 : 100;

  return (
    <section className="card rank-card">
      <div className="rank-head">
        <Emblem level={level} sex={sex} size={name ? 72 : 56} />
        <div className="grow">
          {name ? <>
            <p className="rank-name">{name}</p>
            <p className="rank-title">{titleFor(level, sex)}</p>
          </> : <>
            <p className="stat-label">{titleFor(level, sex)}</p>
            <p className="stat-sub">Rank {level} of 10</p>
          </>}
        </div>
      </div>
      <div className="rank-bar" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
        <div key={level} className="rank-fill" style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
        <span className="rank-bar-text">
          {next ? `${fmt(next.threshold - shown)} points until next level` : 'Max level reached'}
        </span>
      </div>
      <div className="cat-meta">
        <span>{fmt(shown)} / {fmt(CYCLE_MAX)} cycle pts</span>
        <span>{next ? `Next: ${titleFor(next.level, sex)}` : 'Perfect cycle.'}</span>
      </div>
    </section>
  );
}

/** Full-screen celebration when a check-in crosses a rank threshold. */
export function LevelUp({ level, sex, onDone }: { level: number; sex: Sex | null; onDone: () => void }) {
  return (
    <main className="screen center level-up">
      <p className="eyebrow">Level up</p>
      <div className="level-up-emblem"><Emblem level={level} sex={sex} size={132} /></div>
      <h1 className="q-text">{titleFor(level, sex)}</h1>
      <p className="muted">Rank {level} of 10. Every point this cycle got you here.</p>
      <button className="btn accent block big" onClick={onDone}>Continue</button>
    </main>
  );
}
