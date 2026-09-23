import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../lib/auth';
import { supabase, friendlyError } from '../../lib/supabase';
import { addDays, formatWeek, localDate, weekStart } from '../../lib/dates';
import type { UserStatus } from '../../lib/types';
import { isSuperAdmin } from '../../lib/roles';
import { Empty, ErrorText } from '../../components/ui';
import { Icon } from '../../components/Icon';

interface DirRow {
  id: string; username: string; display_name: string; email: string | null;
  role: 'participant' | 'admin'; status: UserStatus; timezone: string;
  infraction_count: number; open_infraction: boolean; pending_proofs: number;
  notif_enabled: boolean; has_push: boolean; reminder_time: string | null; last_checkin: string | null;
}

export default function People() {
  const { profile } = useAuth();
  const admin = isSuperAdmin(profile);
  const [rows, setRows] = useState<DirRow[] | null>(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_directory');
    if (error) setError(friendlyError(error));
    setRows(((data as DirRow[]) ?? []).filter((r) => r.role === 'participant'));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function remove(r: DirRow) {
    if (!confirm(`Remove ${r.display_name} from the cohort? They'll lose access immediately.`)) return;
    const { error } = await supabase.rpc('remove_participant', { p_user: r.id });
    if (error) setError(friendlyError(error)); else load();
  }

  const lastWeek = addDays(weekStart(localDate(profile?.timezone ?? 'UTC')), -7);
  async function finalize() {
    if (!confirm(`Finalize ${formatWeek(lastWeek)}? This locks scores and creates punishments for Red bands. (It runs automatically every Monday.)`)) return;
    const { data, error } = await supabase.rpc('admin_finalize_week', { p_week: lastWeek });
    if (error) setError(friendlyError(error)); else setMsg(`Week finalized · ${data} new punishment(s).`);
  }

  if (!rows) return <div className="skeleton-list" />;
  const today = localDate(profile?.timezone ?? 'UTC');

  return (
    <>
      {rows.length === 0 && <Empty>No participants yet. Generate an invite code to get started.</Empty>}
      <ul className="list">
        {rows.map((r) => {
          const notif = r.notif_enabled && r.has_push ? 'on' : r.reminder_time ? 'time set, push off' : 'not set up';
          return (
            <li key={r.id} className={`person ${r.status === 'removed' ? 'dim' : ''}`}>
              <div className="row between">
                <div>
                  <strong>{r.display_name}</strong> <span className="small muted">@{r.username}</span>
                  <p className="small muted">{r.email}</p>
                </div>
                <span className={`pill ${r.status === 'active' ? 'green' : r.status === 'removed' ? 'red' : 'amber'}`}>
                  {r.status.replace('_', ' ')}
                </span>
              </div>
              <div className="facts">
                <span className={r.infraction_count >= 2 ? 'bad' : r.infraction_count === 1 ? 'warn' : ''}>
                  <Icon name="alert" size={14} /> {r.infraction_count} infraction{r.infraction_count === 1 ? '' : 's'}
                </span>
                <span className={notif === 'on' ? '' : 'warn'}><Icon name="bell" size={14} /> {notif}{r.reminder_time ? ` · ${r.reminder_time.slice(0, 5)}` : ''}</span>
                <span className={r.last_checkin === today ? '' : 'warn'}>
                  <Icon name="check" size={14} /> {r.last_checkin ? (r.last_checkin === today ? 'checked in today' : `last ${r.last_checkin}`) : 'never checked in'}
                </span>
                {r.pending_proofs > 0 && <span><Icon name="file" size={14} /> {r.pending_proofs} proof to review</span>}
              </div>
              {r.status === 'active' && r.infraction_count >= 2 && (
                <div className="notice red">
                  <strong>Infraction #{r.infraction_count}: your call</strong>
                  <p>Removal is manual. Talk to them first if you'd like.{admin ? '' : ' Only an Admin can remove someone.'}</p>
                  {admin && <button className="btn small danger" onClick={() => remove(r)}>Remove participant</button>}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {admin && <section className="card stack">
        <h2>Week close-out</h2>
        <p className="hint">
          Weeks finalize automatically Monday at 12:00 UTC. Use this if the scheduled job didn't run, or to test.
        </p>
        <ErrorText>{error}</ErrorText>
        {msg && <p className="success">{msg}</p>}
        <button className="btn block" onClick={finalize}>Finalize {formatWeek(lastWeek)}</button>
      </section>}
    </>
  );
}
