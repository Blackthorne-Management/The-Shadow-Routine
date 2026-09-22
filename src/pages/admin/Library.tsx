import { useCallback, useEffect, useState } from 'react';
import { supabase, friendlyError } from '../../lib/supabase';
import { THEME_NAMES } from '../../lib/goals';
import { ThemeIcon } from '../../components/Icon';
import type { ProofType, Theme } from '../../lib/types';
import { ErrorText } from '../../components/ui';

interface Entry { id: string; theme: Theme; description: string; proof_type: ProofType; active: boolean }

const THEMES = Object.keys(THEME_NAMES) as Theme[];
const PROOF_LABELS: Record<ProofType, string> = { photo: 'Photo', video: 'Video', mentor_conversation: 'Mentor talk' };

export default function Library() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [draft, setDraft] = useState<{ theme: Theme; description: string; proof_type: ProofType }>({ theme: 'gym', description: '', proof_type: 'photo' });
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const { data } = await supabase.from('punishment_library').select('*').order('created_at');
    setEntries((data as Entry[]) ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function add() {
    setError('');
    if (!draft.description.trim()) return;
    const { error } = await supabase.from('punishment_library').insert({ ...draft, description: draft.description.trim() });
    if (error) setError(friendlyError(error)); else { setDraft({ ...draft, description: '' }); load(); }
  }

  async function update(id: string, patch: Partial<Entry>) {
    const { error } = await supabase.from('punishment_library').update(patch).eq('id', id);
    if (error) setError(friendlyError(error)); else load();
  }

  async function remove(e: Entry) {
    if (!confirm('Delete this punishment? Past punishments keep their text.')) return;
    await supabase.from('punishment_library').delete().eq('id', e.id);
    load();
  }

  return (
    <>
      <p className="hint">
        When someone ends a week in the Red for a category, they get a random active punishment matching that goal's
        area (or a "Fully custom" one as fallback). Entries marked [Placeholder] are stand-ins until you replace them.
      </p>

      <section className="card stack">
        <h2>Add punishment</h2>
        <div className="row gap">
          <select value={draft.theme} onChange={(e) => setDraft({ ...draft, theme: e.target.value as Theme })}>
            {THEMES.map((t) => <option key={t} value={t}>{THEME_NAMES[t]}</option>)}
          </select>
          <select value={draft.proof_type} onChange={(e) => setDraft({ ...draft, proof_type: e.target.value as ProofType })}>
            {Object.entries(PROOF_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <input placeholder="e.g. Smash a watch you like" value={draft.description}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
        <ErrorText>{error}</ErrorText>
        <button className="btn primary block" onClick={add}>Add</button>
      </section>

      {THEMES.map((t) => {
        const list = entries.filter((e) => e.theme === t);
        if (list.length === 0) return null;
        return (
          <section key={t}>
            <h2 className="section-title row gap"><ThemeIcon theme={t} size={18} /> {THEME_NAMES[t]}</h2>
            <ul className="list">
              {list.map((e) => <LibraryRow key={e.id} e={e} onUpdate={update} onDelete={remove} />)}
            </ul>
          </section>
        );
      })}
    </>
  );
}

function LibraryRow({ e, onUpdate, onDelete }: {
  e: Entry; onUpdate: (id: string, p: Partial<Entry>) => void; onDelete: (e: Entry) => void;
}) {
  const [text, setText] = useState(e.description);
  return (
    <li className={`list-row wrap ${e.active ? '' : 'dim'}`}>
      <input className="grow" value={text} onChange={(ev) => setText(ev.target.value)}
        onBlur={() => text.trim() && text !== e.description && onUpdate(e.id, { description: text.trim() })} />
      <select value={e.proof_type} onChange={(ev) => onUpdate(e.id, { proof_type: ev.target.value as ProofType })}>
        {Object.entries(PROOF_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
      <button className="btn small" onClick={() => onUpdate(e.id, { active: !e.active })}>{e.active ? 'Pause' : 'Use'}</button>
      <button className="icon-btn small" aria-label="Delete" onClick={() => onDelete(e)}>✕</button>
    </li>
  );
}
