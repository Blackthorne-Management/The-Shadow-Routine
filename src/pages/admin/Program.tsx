import { useCallback, useEffect, useState } from 'react';
import { supabase, friendlyError } from '../../lib/supabase';
import { MONTH_WEEKS, ULTRA_TIERS } from '../../lib/goals';
import { addDays, formatDay } from '../../lib/dates';
import type { MonthlyResult } from '../../lib/types';
import { Empty, ErrorText } from '../../components/ui';

/** Program dates (12 weeks = 2 prep + weeks 1–10) and the monthly results. */
export default function Program() {
  const [start, setStart] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [results, setResults] = useState<MonthlyResult[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    const [{ data: s }, { data: r }, { data: p }] = await Promise.all([
      supabase.from('program_settings').select('start_date').eq('id', 1).maybeSingle(),
      supabase.from('monthly_results').select('*').order('month_number').order('avg_pct', { ascending: false }),
      supabase.from('profiles').select('id,display_name'),
    ]);
    setStart(s?.start_date ?? null);
    setDraft(s?.start_date ?? '');
    setResults((r as MonthlyResult[]) ?? []);
    setNames(new Map((p ?? []).map((x) => [x.id, x.display_name])));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function saveStart() {
    setError(''); setMsg('');
    const { error } = await supabase.rpc('admin_set_program_start', { p_date: draft || null });
    if (error) setError(friendlyError(error)); else { setMsg('Saved.'); load(); }
  }

  async function finalizeMonth(m: number) {
    if (!confirm(`Close Month ${m}? This awards Gold Months and rewards, sets the Ultra tier, and issues Ultra Punishments. It runs automatically when week ${m === 1 ? 2 : m === 2 ? 6 : 10} closes.`)) return;
    setError(''); setMsg('');
    const { data, error } = await supabase.rpc('admin_finalize_month', { p_month: m });
    if (error) setError(friendlyError(error)); else { setMsg(`Month ${m} closed for ${data} participant(s).`); load(); }
  }

  const byMonth = [1, 2, 3].map((m) => results.filter((r) => r.month_number === m));

  return (
    <>
      <section className="card stack">
        <h2>Program dates</h2>
        <p className="hint">
          12 weeks: 2 prep weeks (outside the app, credited as green) then program weeks 1–10. Pick the
          <b> Monday of program week 1</b>. Check-ins open that day and close after week 10, when the app becomes read-only.
        </p>
        <label className="field">
          <span>Program week 1 starts (Monday)</span>
          <input type="date" value={draft} onChange={(e) => setDraft(e.target.value)} />
        </label>
        {start && (
          <ul className="small muted program-dates">
            <li>Prep: {formatDay(addDays(start, -14))} – {formatDay(addDays(start, -1))}</li>
            <li>Month 1 closes: {formatDay(addDays(start, 13))} (end of week 2)</li>
            <li>Month 2 closes: {formatDay(addDays(start, 41))} (end of week 6)</li>
            <li>Month 3 closes: {formatDay(addDays(start, 69))} (end of week 10, program ends)</li>
          </ul>
        )}
        <ErrorText>{error}</ErrorText>
        {msg && <p className="success">{msg}</p>}
        <button className="btn primary block" onClick={saveStart} disabled={draft === (start ?? '')}>Save start date</button>
      </section>

      {[1, 2, 3].map((m) => (
        <section key={m} className="stack">
          <div className="row between pad">
            <h2 className="section-title" style={{ margin: 0 }}>Month {m} · {MONTH_WEEKS[m]}</h2>
            {start && byMonth[m - 1].length === 0 && (
              <button className="btn small" onClick={() => finalizeMonth(m)}>Close month</button>
            )}
          </div>
          {byMonth[m - 1].length === 0 ? <Empty>Not closed yet.</Empty> : byMonth[m - 1].map((r) => (
            <div key={r.id} className={`tier-card tier-${r.ultra_tier}`}>
              <div className="row between">
                <strong>{names.get(r.user_id) ?? '?'}</strong>
                <span className="small">{ULTRA_TIERS[r.ultra_tier].name} · {Math.round(Number(r.avg_pct))}%</span>
              </div>
              <p className="small">
                {Object.values(r.goals).map((g) => `${g!.label}: ${g!.pct}%${g!.gold ? ' (Gold)' : ''}`).join(' · ')}
              </p>
            </div>
          ))}
        </section>
      ))}
    </>
  );
}
