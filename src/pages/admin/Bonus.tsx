import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../lib/auth';
import { supabase, friendlyError } from '../../lib/supabase';
import { addDays, formatDay, localDate } from '../../lib/dates';
import { Empty, ErrorText } from '../../components/ui';
import MediaThumb from '../../components/MediaThumb';

interface Challenge {
  id: string; user_id: string; challenge_date: string; description: string; category: string | null;
  photo_path: string | null; review_status: 'rejected' | null; review_note: string | null;
}
interface Preset { id: string; category: string | null; description: string; photo_hint: string | null; sort_order: number; active: boolean }

const CATEGORIES = ['body', 'fuel', 'mind', 'discipline', 'outdoors', 'connection', 'order', 'craft'];
const REVIEW_DAYS = 7;

/**
 * Daily challenges are random and personal (7 pts each, max 49/week) and need a
 * photo. Here: recent challenge photos to review, and the challenge library.
 */
export default function Bonus() {
  const { profile } = useAuth();
  const today = localDate(profile?.timezone ?? 'UTC');
  const [photos, setPhotos] = useState<Challenge[] | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [presets, setPresets] = useState<Preset[]>([]);
  const [cat, setCat] = useState('all');
  const [draft, setDraft] = useState({ category: 'body', description: '', photo_hint: '' });
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const since = addDays(today, -REVIEW_DAYS);
    // Only rows staff can see come back (their cohorts; Admins: everyone)
    const [{ data: ch }, { data: comp }, { data: pr }, { data: ppl }] = await Promise.all([
      supabase.from('bonus_challenges').select('id,user_id,challenge_date,description,category,photo_path,review_status,review_note')
        .not('user_id', 'is', null).not('photo_path', 'is', null).gte('challenge_date', since)
        .order('challenge_date', { ascending: false }),
      supabase.from('bonus_completions').select('bonus_challenge_id,completed'),
      supabase.from('bonus_presets').select('*').order('category').order('sort_order'),
      supabase.from('profiles').select('id,display_name'),
    ]);
    setPhotos((ch as Challenge[]) ?? []);
    setDone(new Set((comp ?? []).filter((c) => c.completed).map((c) => c.bonus_challenge_id)));
    setPresets((pr as Preset[]) ?? []);
    setNames(new Map((ppl ?? []).map((p) => [p.id, p.display_name])));
  }, [today]);
  useEffect(() => { load(); }, [load]);

  async function review(c: Challenge, accept: boolean) {
    const note = accept ? null : prompt('Why? (optional, they see this)') ?? undefined;
    if (note === undefined) return;
    setError('');
    const { error } = await supabase.rpc('review_bonus', { p_challenge: c.id, p_accept: accept, p_note: note });
    if (error) setError(friendlyError(error)); else load();
  }

  async function addPreset() {
    if (!draft.description.trim()) return;
    const max = presets.reduce((m, p) => Math.max(m, p.sort_order), 0);
    const { error } = await supabase.from('bonus_presets').insert({
      category: draft.category, description: draft.description.trim(), photo_hint: draft.photo_hint.trim() || null, sort_order: max + 1,
    });
    if (error) setError(friendlyError(error)); else { setDraft({ ...draft, description: '', photo_hint: '' }); load(); }
  }

  async function togglePreset(p: Preset) {
    await supabase.from('bonus_presets').update({ active: !p.active }).eq('id', p.id);
    load();
  }

  const library = presets.filter((p) => p.category && (cat === 'all' || p.category === cat));
  const active = presets.filter((p) => p.active && p.category).length;

  return (
    <>
      <p className="hint pad">
        Everyone gets their own random challenge each day (7 pts, max 49/week) from the {active} active challenges below.
        No repeats for a person within 120 days, a different category than yesterday, and no two people get the same one on a day.
        It only counts with a photo or clip.
      </p>

      <h2 className="section-title">Challenge photos · last {REVIEW_DAYS} days</h2>
      <ErrorText>{error}</ErrorText>
      {!photos ? <div className="skeleton-list" /> : photos.length === 0 ? <Empty>No challenge photos yet.</Empty> : (
        <ul className="list">
          {photos.map((c) => (
            <li key={c.id} className={`list-row wrap ${c.review_status === 'rejected' ? 'dim' : ''}`}>
              <MediaThumb path={c.photo_path!} controls />
              <div className="grow stack tight" style={{ minWidth: 0 }}>
                <strong>{names.get(c.user_id) ?? '…'}</strong>
                <span className="small">{c.description}</span>
                <span className="small muted">
                  {formatDay(c.challenge_date)}{c.category ? ` · ${c.category}` : ''}
                  {c.review_status === 'rejected' ? ' · rejected' : done.has(c.id) ? ' · counted' : ' · not marked done'}
                </span>
              </div>
              {c.review_status === 'rejected'
                ? <button className="btn small" onClick={() => review(c, true)}>Undo</button>
                : <button className="btn small danger" onClick={() => review(c, false)}>Reject</button>}
            </li>
          ))}
        </ul>
      )}

      <h2 className="section-title">Challenge library</h2>
      <div className="chips">
        {['all', ...CATEGORIES].map((c) => (
          <button key={c} className={`chip ${cat === c ? 'on' : ''}`} onClick={() => setCat(c)}>{c}</button>
        ))}
      </div>
      <section className="card stack">
        <h2>Add a challenge</h2>
        <select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} aria-label="Category">
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input placeholder="The challenge, e.g. Do 100 push-ups today." value={draft.description}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
        <input placeholder="What to photograph, e.g. You mid-set." value={draft.photo_hint}
          onChange={(e) => setDraft({ ...draft, photo_hint: e.target.value })} />
        <button className="btn primary" onClick={addPreset}>Add</button>
      </section>
      <ul className="list">
        {library.map((p) => (
          <li key={p.id} className={`list-row ${p.active ? '' : 'dim'}`}>
            <div className="grow stack tight">
              <span>{p.description}</span>
              <span className="small muted">{p.category}{p.photo_hint ? ` · Photo: ${p.photo_hint}` : ''}</span>
            </div>
            <button className="btn small" onClick={() => togglePreset(p)}>{p.active ? 'Pause' : 'Use'}</button>
          </li>
        ))}
      </ul>
    </>
  );
}
