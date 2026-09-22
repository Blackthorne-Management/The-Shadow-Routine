import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../lib/auth';
import { supabase, friendlyError } from '../../lib/supabase';
import { addDays, formatDay, localDate } from '../../lib/dates';
import { ErrorText } from '../../components/ui';

interface Challenge { id: string; challenge_date: string; description: string; source: 'manual' | 'auto' }
interface Preset { id: string; description: string; sort_order: number; active: boolean }

const DAYS_AHEAD = 14;

export default function Bonus() {
  const { profile } = useAuth();
  const today = localDate(profile?.timezone ?? 'UTC');
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [newPreset, setNewPreset] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    // Fill any empty days from the rotation so the admin sees what's coming
    const days = Array.from({ length: DAYS_AHEAD }, (_, i) => addDays(today, i));
    await Promise.all(days.map((d) => supabase.rpc('ensure_bonus_challenge', { p_date: d })));
    const [{ data: ch }, { data: pr }] = await Promise.all([
      supabase.from('bonus_challenges').select('*').gte('challenge_date', today).lte('challenge_date', days.at(-1)!).order('challenge_date'),
      supabase.from('bonus_presets').select('*').order('sort_order').order('created_at'),
    ]);
    setChallenges((ch as Challenge[]) ?? []);
    setPresets((pr as Preset[]) ?? []);
  }, [today]);
  useEffect(() => { load(); }, [load]);

  async function setChallenge(date: string, description: string) {
    setError('');
    const { error } = await supabase.from('bonus_challenges')
      .upsert({ challenge_date: date, description: description.trim(), source: 'manual' }, { onConflict: 'challenge_date' });
    if (error) setError(friendlyError(error)); else load();
  }

  async function addPreset() {
    if (!newPreset.trim()) return;
    const max = presets.reduce((m, p) => Math.max(m, p.sort_order), 0);
    const { error } = await supabase.from('bonus_presets').insert({ description: newPreset.trim(), sort_order: max + 1 });
    if (error) setError(friendlyError(error)); else { setNewPreset(''); load(); }
  }

  async function togglePreset(p: Preset) {
    await supabase.from('bonus_presets').update({ active: !p.active }).eq('id', p.id);
    load();
  }

  async function deletePreset(p: Preset) {
    if (!confirm(`Delete "${p.description}"?`)) return;
    await supabase.from('bonus_presets').delete().eq('id', p.id);
    load();
  }

  return (
    <>
      <p className="hint">Each challenge is worth 7 pts (max 49/week). Days you don't set rotate through the preset list automatically.</p>
      <h2 className="section-title">Upcoming</h2>
      <ul className="list">
        {challenges.map((c) => <ChallengeRow key={c.id} c={c} isToday={c.challenge_date === today} onSave={setChallenge} />)}
      </ul>
      <ErrorText>{error}</ErrorText>

      <h2 className="section-title">Rotation presets</h2>
      <ul className="list">
        {presets.map((p) => (
          <li key={p.id} className={`list-row ${p.active ? '' : 'dim'}`}>
            <span className="grow">{p.description}</span>
            <button className="btn small" onClick={() => togglePreset(p)}>{p.active ? 'Pause' : 'Use'}</button>
            <button className="icon-btn small" aria-label="Delete preset" onClick={() => deletePreset(p)}>✕</button>
          </li>
        ))}
      </ul>
      <div className="row gap">
        <input className="grow" placeholder="Add a preset challenge" value={newPreset}
          onChange={(e) => setNewPreset(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addPreset()} />
        <button className="btn" onClick={addPreset}>Add</button>
      </div>
    </>
  );
}

function ChallengeRow({ c, isToday, onSave }: { c: Challenge; isToday: boolean; onSave: (date: string, d: string) => void }) {
  const [value, setValue] = useState(c.description);
  const dirty = value.trim() !== c.description;
  return (
    <li className="list-row">
      <div className="date-chip">
        <span>{formatDay(c.challenge_date, { weekday: 'short' })}</span>
        <strong>{formatDay(c.challenge_date, { day: 'numeric' })}</strong>
      </div>
      <div className="grow stack tight">
        <input value={value} onChange={(e) => setValue(e.target.value)} aria-label={`Challenge for ${c.challenge_date}`} />
        <span className="small muted">{isToday ? 'Today · ' : ''}{c.source === 'auto' ? 'auto-rotated' : 'set by you'}</span>
      </div>
      {dirty && value.trim() && <button className="btn small primary" onClick={() => onSave(c.challenge_date, value)}>Save</button>}
    </li>
  );
}
