import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase, friendlyError } from '../../lib/supabase';
import { timeAgo } from '../../lib/dates';
import { DirectThread, loadPeople, type Person } from '../DirectMessages';
import { Empty, ErrorText } from '../../components/ui';

interface Pair { a: string; b: string; last_text: string; last_at: string; messages: number }

/** Admin only: every direct-message conversation in the app, read-only. */
export default function AdminDms() {
  const [pairs, setPairs] = useState<Pair[] | null>(null);
  const [people, setPeople] = useState<Map<string, Person>>(new Map());
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([supabase.rpc('admin_dm_threads'), loadPeople()]).then(([{ data, error }, map]) => {
      if (error) setError(friendlyError(error));
      setPairs((data as Pair[]) ?? []);
      setPeople(map);
    });
  }, []);

  return (
    <>
      <p className="hint pad">Every direct-message conversation. Only Admins can see this; Mentors can't. People aren't told when you read.</p>
      <ErrorText>{error}</ErrorText>
      {!pairs ? <div className="skeleton-list" /> : pairs.length === 0 ? <Empty>No direct messages yet.</Empty> : (
        <ul className="list dm-list">
          {pairs.map((p) => (
            <li key={`${p.a}-${p.b}`}>
              <Link to={`/admin/dms/${p.a}/${p.b}`} className="list-row link-row">
                <div className="grow" style={{ minWidth: 0 }}>
                  <strong>{people.get(p.a)?.display_name ?? '…'} <span className="muted">↔</span> {people.get(p.b)?.display_name ?? '…'}</strong>
                  <p className="small muted dm-preview">{p.last_text}</p>
                </div>
                <div className="stack tight" style={{ alignItems: 'flex-end' }}>
                  <span className="small muted">{timeAgo(p.last_at)}</span>
                  <span className="small muted">{p.messages} msg</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export function AdminDmThread() {
  const { a, b } = useParams();
  if (!a || !b) return null;
  return <DirectThread a={a} b={b} readOnly back="/admin/dms" />;
}
