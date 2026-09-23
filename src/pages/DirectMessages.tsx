import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { supabase, friendlyError } from '../lib/supabase';
import { timeAgo } from '../lib/dates';
import { isStaff, isSuperAdmin, staffLabel } from '../lib/roles';
import type { ChatMessage, Sex } from '../lib/types';
import { Empty, ErrorText } from '../components/ui';
import Emblem from '../components/Emblem';
import { Icon } from '../components/Icon';
import { useCohorts } from '../lib/cohorts';
import ChatComposer from '../components/ChatComposer';
import { Bubble } from '../components/ChatMedia';
import type { MediaType } from '../lib/chatMedia';

export interface Person {
  id: string; display_name: string; role: string; is_super_admin: boolean; is_mentor: boolean;
  status: string; sex: Sex | null; rank_level: number; cohort_id: string | null;
}
interface Thread { other_id: string; last_text: string; last_at: string; last_from_me: boolean; unread: number }

const PEOPLE = 'id,display_name,role,is_super_admin,is_mentor,status,sex,rank_level,cohort_id';
export async function loadPeople(): Promise<Map<string, Person>> {
  const { data } = await supabase.from('profiles').select(PEOPLE);
  return new Map(((data as Person[]) ?? []).map((p) => [p.id, p]));
}

export function Who({ p, size = 20 }: { p?: Person; size?: number }) {
  return isStaff(p) ? <span className="level">{staffLabel(p)}</span> : <Emblem level={p?.rank_level ?? 1} sex={p?.sex} size={size} />;
}

const pairFilter = (a: string, b: string) =>
  `and(user_id.eq.${a},recipient_id.eq.${b}),and(user_id.eq.${b},recipient_id.eq.${a})`;

/** Your conversations + starting a new one (the "Direct" tab in Chat). */
export function DirectList() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [people, setPeople] = useState<Map<string, Person>>(new Map());
  const [picking, setPicking] = useState(false);
  const { cohorts, mentorsOf } = useCohorts();
  const cohortName = (id: string | null) => cohorts?.find((c) => c.id === id)?.name ?? null;

  const load = useCallback(async () => {
    const [{ data }, map] = await Promise.all([supabase.rpc('my_dm_threads'), loadPeople()]);
    setThreads((data as Thread[]) ?? []);
    setPeople(map);
  }, []);

  useEffect(() => {
    if (!profile) return;
    load();
    const ch = supabase.channel(`dm-list-${profile.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `recipient_id=eq.${profile.id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [profile, load]);

  if (!profile) return null;
  // Anyone active, in any cohort. Your cohort (and its mentors) first, then everyone else A–Z.
  const byName = (a: Person, b: Person) => a.display_name.localeCompare(b.display_name);
  const myMentors = new Set(profile.cohort_id ? mentorsOf(profile.cohort_id) : []);
  const everyone = [...people.values()].filter((p) => p.id !== profile.id && p.status === 'active');
  const mine = everyone.filter((p) => p.cohort_id === profile.cohort_id || myMentors.has(p.id)).sort(byName);
  const others = everyone.filter((p) => !mine.includes(p)).sort(byName);
  const pickRow = (p: Person) => (
    <li key={p.id}>
      <button className="list-row block" style={{ textAlign: 'left' }} onClick={() => navigate(`/chat/dm/${p.id}`)}>
        <Who p={p} size={24} />
        <div className="grow">
          <strong>{p.display_name}</strong>
          {cohortName(p.cohort_id) && <p className="small muted">{cohortName(p.cohort_id)}</p>}
        </div>
        <span aria-hidden>›</span>
      </button>
    </li>
  );

  return (
    <>
      <button className="btn primary block" onClick={() => setPicking((v) => !v)}>
        {picking ? 'Cancel' : <><Icon name="chat" size={16} /> New message</>}
      </button>
      {picking && (
        <div className="people-pick stack">
          {mine.length > 0 && <>
            <p className="eyebrow pad">{cohortName(profile.cohort_id) ?? 'Your cohort'}</p>
            <ul className="list">{mine.map(pickRow)}</ul>
          </>}
          {others.length > 0 && <>
            <p className="eyebrow pad">Everyone else</p>
            <ul className="list">{others.map(pickRow)}</ul>
          </>}
          {everyone.length === 0 && <Empty>No one to message yet.</Empty>}
        </div>
      )}
      {!picking && (!threads ? <div className="skeleton-list" /> : threads.length === 0 ? (
        <Empty>No direct messages yet. Start one with anyone, in any cohort.</Empty>
      ) : (
        <ul className="list dm-list">
          {threads.map((t) => {
            const p = people.get(t.other_id);
            return (
              <li key={t.other_id}>
                <Link to={`/chat/dm/${t.other_id}`} className={`list-row link-row dm-row ${t.unread ? 'unread' : ''}`}>
                  <Who p={p} size={24} />
                  <div className="grow" style={{ minWidth: 0 }}>
                    <strong>{p?.display_name ?? '…'}</strong>
                    {p && p.cohort_id !== profile.cohort_id && cohortName(p.cohort_id) && <span className="small muted"> · {cohortName(p.cohort_id)}</span>}
                    <p className="small muted dm-preview">{t.last_from_me ? 'You: ' : ''}{t.last_text}</p>
                  </div>
                  <div className="stack tight" style={{ alignItems: 'flex-end' }}>
                    <span className="small muted">{timeAgo(t.last_at)}</span>
                    {t.unread > 0 && <span className="count-badge">{t.unread}</span>}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      ))}
      <p className="dm-note">Admins can see direct messages.</p>
    </>
  );
}

/**
 * One conversation. For you: you ↔ someone (you can send). For an Admin
 * reviewing: any two people, read-only (`a`/`b` given, `readOnly`).
 */
export function DirectThread({ a, b, readOnly = false, back }: { a: string; b: string; readOnly?: boolean; back: string }) {
  const { profile } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [people, setPeople] = useState<Map<string, Person>>(new Map());
  const [error, setError] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const admin = isSuperAdmin(profile);

  const markRead = useCallback(() => {
    if (readOnly) return;
    supabase.rpc('mark_dm_read', { p_other: b }).then(() => window.dispatchEvent(new Event('dm-read')));
  }, [b, readOnly]);

  useEffect(() => {
    setMessages(null);
    loadPeople().then(setPeople);
    supabase.from('messages').select('*').eq('channel', 'dm').or(pairFilter(a, b))
      .order('created_at', { ascending: false }).limit(300)
      .then(({ data }) => { setMessages(((data as ChatMessage[]) ?? []).reverse()); markRead(); });
    const inPair = (m: ChatMessage) => (m.user_id === a && m.recipient_id === b) || (m.user_id === b && m.recipient_id === a);
    const ch = supabase.channel(`dm-${a}-${b}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: 'channel=eq.dm' }, (p) => {
        const m = p.new as ChatMessage;
        if (!inPair(m)) return;
        setMessages((list) => (list?.some((x) => x.id === m.id) ? list : [...(list ?? []), m]));
        if (m.recipient_id === profile?.id) markRead();
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' },
        (p) => setMessages((list) => list?.filter((x) => x.id !== (p.old as ChatMessage).id) ?? null))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [a, b, profile?.id, markRead]);

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [messages?.length]);

  async function send(body: string, media: { path: string; type: MediaType } | null) {
    if (!profile) return null;
    const { data, error } = await supabase.from('messages')
      .insert({ channel: 'dm', cohort_id: null, user_id: profile.id, recipient_id: b, message_text: body,
                media_path: media?.path ?? null, media_type: media?.type ?? null }).select().single();
    if (error) return friendlyError(error);
    setMessages((list) => (list?.some((x) => x.id === data.id) ? list : [...(list ?? []), data as ChatMessage]));
    return null;
  }

  async function remove(m: ChatMessage) {
    if (!confirm('Delete this message?')) return;
    const { error } = await supabase.from('messages').delete().eq('id', m.id);
    if (error) setError(friendlyError(error));
    else setMessages((list) => list?.filter((x) => x.id !== m.id) ?? null);
  }

  const pa = people.get(a), pb = people.get(b);
  // In your own conversation "mine" is you; in an Admin review, the first person sits on the right
  const right = readOnly ? a : profile?.id;

  return (
    <>
      <header className="dm-head">
        <Link to={back} className="icon-btn small" aria-label="Back"><span aria-hidden>‹</span></Link>
        {readOnly
          ? <h1>{pa?.display_name ?? '…'} <span className="muted">↔</span> {pb?.display_name ?? '…'}</h1>
          : <><Who p={pb} size={26} /><h1>{pb?.display_name ?? '…'}</h1></>}
      </header>
      {readOnly && <p className="notice">Admin view. {pa?.display_name ?? 'They'} and {pb?.display_name ?? 'they'} aren't notified that you read this.</p>}
      {!messages ? <div className="skeleton-list" /> : messages.length === 0 ? (
        <Empty>No messages yet. Say hi.</Empty>
      ) : (
        <ul className="chat-list">
          {messages.map((m) => {
            const mine = m.user_id === right;
            const who = people.get(m.user_id);
            const canDelete = m.user_id === profile?.id || admin;
            return (
              <li key={m.id} className={`chat-msg ${mine ? 'mine' : ''}`}>
                <div className="chat-meta">
                  {readOnly && <strong>{who?.display_name ?? '…'}</strong>}
                  <span className="small muted">{timeAgo(m.created_at)}</span>
                  {canDelete && <button className="link muted small chat-delete" onClick={() => remove(m)} aria-label="Delete message">Delete</button>}
                </div>
                <Bubble m={m} />
              </li>
            );
          })}
        </ul>
      )}
      <div ref={endRef} />
      {!readOnly && (
        <>
          <ErrorText>{error}</ErrorText>
          <ChatComposer userId={profile!.id} onSend={send} note="Admins can see direct messages."
            placeholder={`Message ${pb?.display_name.split(' ')[0] ?? ''}`} />
        </>
      )}
      {readOnly && <ErrorText>{error}</ErrorText>}
    </>
  );
}

/** /chat/dm/:id */
export default function DirectMessagePage() {
  const { id } = useParams();
  const { profile } = useAuth();
  if (!id || !profile) return null;
  return (
    <main className="screen with-tabs chat-screen">
      <DirectThread a={profile.id} b={id} back="/chat?c=direct" />
    </main>
  );
}
