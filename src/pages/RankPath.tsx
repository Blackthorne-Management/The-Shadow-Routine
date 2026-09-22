import { useState } from 'react';
import { useAuth } from '../lib/auth';
import { supabase, friendlyError } from '../lib/supabase';
import { LEVELS } from '../lib/ranks';
import type { Sex } from '../lib/types';
import { ErrorText, TopBar } from '../components/ui';
import Emblem from '../components/Emblem';

/** One-time choice for accounts created before the rank system existed. */
export default function RankPath() {
  const { refresh } = useAuth();
  const [sex, setSex] = useState<Sex | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    if (!sex) return;
    setBusy(true); setError('');
    const { error } = await supabase.rpc('set_rank_path', { p_sex: sex });
    setBusy(false);
    if (error) setError(friendlyError(error)); else refresh();
  }

  return (
    <main className="screen">
      <TopBar pill="New: ranks" />
      <section className="card">
        <h1>Choose your rank path</h1>
        <p className="muted">
          Every point you earn over the 10 weeks adds up toward 10 ranks, from Shadow Initiate to The Eclipse.
          Your path only decides which titles you see. It doesn't change scoring or goals.
        </p>
      </section>
      <SexPicker value={sex} onChange={setSex} />
      <ErrorText>{error}</ErrorText>
      <button className="btn primary block" onClick={save} disabled={!sex || busy}>{busy ? 'Saving…' : 'Continue'}</button>
    </main>
  );
}

export function SexPicker({ value, onChange }: { value: Sex | null; onChange: (s: Sex) => void }) {
  return (
    <div className="path-pick" role="radiogroup" aria-label="Sex">
      {(['male', 'female'] as const).map((s) => (
        <button key={s} type="button" role="radio" aria-checked={value === s}
          className={`path-option ${value === s ? 'on' : ''}`} onClick={() => onChange(s)}>
          <Emblem level={5} sex={s} size={40} />
          <strong>{s === 'male' ? 'Male' : 'Female'}</strong>
          <span className="small">{LEVELS.slice(2, 9).map((l) => l[s].replace('Shadow ', '')).slice(0, 3).join(' · ')} …</span>
        </button>
      ))}
    </div>
  );
}
