import { useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { LEVELS } from '../lib/ranks';
import type { Sex } from '../lib/types';
import { Wordmark } from '../components/ui';
import Emblem from '../components/Emblem';
import { Icon, ThemeIcon } from '../components/Icon';

interface Slide { eyebrow: string; title: string; body: ReactNode; visual?: ReactNode }

const slides = (sex: Sex | null): Slide[] => [
  {
    eyebrow: 'Welcome',
    title: 'Most consistent wins.',
    body: <p>12 weeks of daily accountability with a small cohort. You track 5 goals every night, earn points every week, and climb 10 ranks. Here's how it works.</p>,
    visual: <div className="ob-hero"><Emblem level={10} sex={sex} size={120} /></div>,
  },
  {
    eyebrow: 'Your 5 goals',
    title: 'Five goals, weighted points.',
    body: <p>Your five required goals are scored each week (Mon–Sun); an optional sixth is just for tracking. Hit your target and you get the full points. Your own random daily challenge adds 7 more (with a photo), up to 49 a week. <b>1,049 is a perfect week.</b></p>,
    visual: (
      <ul className="ob-goals">
        <li><ThemeIcon theme="gym" size={18} /><span>Workouts: each one 30+ min, with a photo or clip</span><b>300</b></li>
        <li><ThemeIcon theme="refraining" size={18} /><span>Refrain: something you're giving up</span><b>200</b></li>
        <li><ThemeIcon theme="reading" size={18} /><span>Reading: chapters of a nonfiction book that helps your goals</span><b>200</b></li>
        <li><ThemeIcon theme="nutrition" size={18} /><span>Eating: sticking to your chosen diet</span><b>150</b></li>
        <li><ThemeIcon theme="word" size={18} /><span>Custom goal</span><b>150</b></li>
        <li><ThemeIcon theme="other" size={18} /><span>Optional: one more, just for tracking</span><b>0</b></li>
        <li><Icon name="bolt" size={18} /><span>Daily challenge: random, just for you, photo required</span><b>+7</b></li>
      </ul>
    ),
  },
  {
    eyebrow: 'Every night',
    title: 'Check in, one question at a time.',
    body: <p>It takes under 2 minutes. Pick a reminder time and we'll nudge you. You can edit today until midnight; past days lock. Snap a photo during every workout: it's accountability.</p>,
    visual: <div className="ob-yesno"><span>Did you avoid sugar today?</span><div><b className="yes">YES</b><b>NO</b></div></div>,
  },
  {
    eyebrow: 'Weekly colors',
    title: 'Green, gray, red.',
    body: <p>Each goal gets a color for the week. Mid-week you're never red: falling behind just shows gray, so you can catch up. <b>Red is only decided when the week closes.</b></p>,
    visual: (
      <div className="ob-bands">
        <div className="tier-card tier-green"><strong>Green · 80%+</strong><span className="small">On track.</span></div>
        <div className="tier-card tier-gray"><strong>Gray · 60–79%</strong><span className="small">No punishment. Catch up.</span></div>
        <div className="tier-card tier-red"><strong>Red · under 60%</strong><span className="small">That goal's punishment.</span></div>
      </div>
    ),
  },
  {
    eyebrow: 'Punishments',
    title: 'A red week has a price.',
    body: (
      <>
        <p>You write each goal's red-week punishment with your coach when you sign up. After a red week, do it the following week and <b>show your mentor proof</b> (a photo or clip).</p>
        <p>If proof is rejected, that's an infraction. The first is a warning and a talk with your mentor. A second can cost you your spot.</p>
      </>
    ),
    visual: <div className="ob-icon"><Icon name="alert" size={56} /></div>,
  },
  {
    eyebrow: 'Months & rewards',
    title: 'Chase Gold Months.',
    body: (
      <>
        <p>12 weeks = 2 prep weeks + 10 program weeks, grouped into 3 months. The prep weeks count as green for everyone, so you all start even.</p>
        <p>A <b>Gold Month</b> in a goal means hitting the monthly total with 3+ green weeks, at most 1 gray and no red. It earns the reward you chose. Gold all 3 months earns your big reward. Rewards are yours to grant yourself.</p>
      </>
    ),
    visual: (
      <div className="month-weeks ob-weeks">
        <span className="wk band-green prep">P</span><span className="wk band-green prep">P</span>
        <span className="wk band-green">1</span><span className="wk band-gray">2</span>
        <span className="ob-arrow"><Icon name="arrow" size={18} /></span><span className="level gold">Gold Month</span>
      </div>
    ),
  },
  {
    eyebrow: 'The Ultra month',
    title: 'All five goals, judged together.',
    body: <p>Each month also gets an overall tier across your 5 goals.</p>,
    visual: (
      <div className="ob-bands">
        <div className="tier-card tier-gold"><strong>Ultra Gold</strong><span className="small">80%+ in every goal, no gray weeks. Grant yourself one wish.</span></div>
        <div className="tier-card tier-green"><strong>Ultra Green</strong><span className="small">75%+ in every goal, at most one gray. Good job.</span></div>
        <div className="tier-card tier-gray"><strong>Ultra Gray</strong><span className="small">Just showing up. Lock in.</span></div>
        <div className="tier-card tier-red"><strong>Ultra Red</strong><span className="small">Under 60%. Your Ultra Punishment.</span></div>
      </div>
    ),
  },
  {
    eyebrow: 'Ranks',
    title: 'Every point adds up.',
    body: <p>Your points over all 10 weeks count toward 10 ranks, from <b>{LEVELS[0][sex ?? 'male']}</b> to <b>The Eclipse</b>, which takes a perfect cycle. Your emblem shows next to your name.</p>,
    visual: (
      <div className="ob-ranks">
        {[1, 3, 5, 7, 9, 10].map((l) => <Emblem key={l} level={l} sex={sex} size={l === 10 ? 52 : 38} />)}
      </div>
    ),
  },
  {
    eyebrow: 'Your mentor',
    title: 'Someone is watching. That\'s the point.',
    body: (
      <>
        <p>Your mentor approves your goals and consequences, reviews workout photos and punishment proof, and is in the chat.</p>
        <p>No photo for a workout? Send your mentor a note. It counts only if they accept it.</p>
      </>
    ),
    visual: <div className="ob-icon"><span className="level ob-mentor">Mentor</span></div>,
  },
  {
    eyebrow: 'Your cohort',
    title: 'You\'re not doing this alone.',
    body: <p>The leaderboard updates live every week. Chat with your cohort, or with everyone. Choose which notifications you get in <b>Me</b>. You can reopen this guide from there too.</p>,
    visual: <div className="ob-icon"><Icon name="chat" size={56} /></div>,
  },
];

/** Swipeable "how it works" intro. First run: shown once after signup, then goal setup. */
export default function Onboarding({ firstRun = false }: { firstRun?: boolean }) {
  const { profile, refresh } = useAuth();
  const navigate = useNavigate();
  const list = slides(profile?.sex ?? null);
  const [i, setI] = useState(0);
  const [busy, setBusy] = useState(false);
  const track = useRef<HTMLDivElement>(null);
  const last = i === list.length - 1;

  const go = (n: number) => {
    const el = track.current;
    if (!el) return;
    el.scrollTo({ left: n * el.clientWidth, behavior: 'smooth' });
  };

  async function finish() {
    if (!firstRun) { navigate(-1); return; }
    setBusy(true);
    await supabase.rpc('mark_onboarded');
    await refresh();
    navigate('/', { replace: true });
  }

  return (
    <main className="screen onboarding">
      <header className="row between ob-top">
        <Wordmark />
        {!last && <button className="link" onClick={finish} disabled={busy}>{firstRun ? 'Skip' : 'Close'}</button>}
      </header>

      <div className="ob-track" ref={track}
        onScroll={(e) => { const el = e.currentTarget; setI(Math.round(el.scrollLeft / el.clientWidth)); }}>
        {list.map((s, n) => (
          <section key={n} className="ob-slide" aria-hidden={n !== i}>
            {s.visual && <div className="ob-visual">{s.visual}</div>}
            <div className="card ob-text">
              <p className="eyebrow">{s.eyebrow}</p>
              <h1>{s.title}</h1>
              <div className="ob-body">{s.body}</div>
            </div>
          </section>
        ))}
      </div>

      <div className="ob-dots" role="tablist" aria-label="Guide pages">
        {list.map((_, n) => (
          <button key={n} role="tab" aria-selected={n === i} aria-label={`Page ${n + 1}`}
            className={n === i ? 'on' : ''} onClick={() => go(n)} />
        ))}
      </div>
      <div className="row gap">
        {i > 0 && <button className="btn grow" onClick={() => go(i - 1)}>Back</button>}
        {last
          ? <button className="btn primary grow" onClick={finish} disabled={busy}>
              {firstRun ? (profile?.status === 'pending_approval' ? 'Set my goals' : "Let's go") : 'Done'}
            </button>
          : <button className="btn primary grow" onClick={() => go(i + 1)}>Next</button>}
      </div>
    </main>
  );
}
