import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useAuth } from '../lib/auth';
import { supabase, friendlyError } from '../lib/supabase';
import { timeAgo } from '../lib/dates';
import type { ChatMessage, Sex } from '../lib/types';
import { Empty, ErrorText, TopBar } from '../components/ui';
import Emblem from '../components/Emblem';

interface Member { id: string; display_name: string; role: string; sex: Sex | null; rank_level: number }

/** Cohort chat: text only, live via Realtime. The admin can post and delete. */
export default function Chat() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const cohort = profile?.cohort_id ?? null;
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [members, setMembers] = useState<Map<string, Member>>(new Map());
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  const loadMembers = useCallback(async () => {
    const { data } = await supabase.from('profiles').select('id,display_name,role,sex,rank_level');
    setMembers(new Map(((data as Member[]) ?? []).map((m) => [m.id, m])));
  }, []);

  useEffect(() => {
    if (!cohort) return;
    loadMembers();
    supabase.from('messages').select('*').eq('cohort_id', cohort).order('created_at', { ascending: false }).limit(200)
      .then(({ data }) => setMessages(((data as ChatMessage[]) ?? []).reverse()));

    const ch = supabase.channel(`chat-${cohort}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `cohort_id=eq.${cohort}` },
        (p) => {
          const m = p.new as ChatMessage;
          setMessages((list) => (list?.some((x) => x.id === m.id) ? list : [...(list ?? []), m]));
          setMembers((mm) => { if (!mm.has(m.user_id)) loadMembers(); return mm; });
        })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' },
        (p) => setMessages((list) => list?.filter((x) => x.id !== (p.old as ChatMessage).id) ?? null))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [cohort, loadMembers]);

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [messages?.length]);

  async function send(e: FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body || !profile || !cohort) return;
    setBusy(true); setError('');
    const { data, error } = await supabase.from('messages')
      .insert({ cohort_id: cohort, user_id: profile.id, message_text: body }).select().single();
    setBusy(false);
    if (error) return setError(friendlyError(error));
    setText('');
    setMessages((list) => (list?.some((x) => x.id === data.id) ? list : [...(list ?? []), data as ChatMessage]));
  }

  async function remove(m: ChatMessage) {
    if (!confirm('Delete this message for everyone?')) return;
    const { error } = await supabase.from('messages').delete().eq('id', m.id);
    if (error) setError(friendlyError(error));
    else setMessages((list) => list?.filter((x) => x.id !== m.id) ?? null);
  }

  return (
    <main className="screen with-tabs chat-screen">
      <TopBar pill={isAdmin ? 'Mentor view' : 'Cohort'} />
      {!messages ? <div className="skeleton-list" /> : messages.length === 0 ? (
        <Empty>No messages yet. Say something to your cohort.</Empty>
      ) : (
        <ul className="chat-list">
          {messages.map((m) => {
            const who = members.get(m.user_id);
            const mine = m.user_id === profile?.id;
            const mentor = who?.role === 'admin';
            return (
              <li key={m.id} className={`chat-msg ${mine ? 'mine' : ''} ${mentor ? 'mentor' : ''}`}>
                <div className="chat-meta">
                  {mentor ? <span className="level">Mentor</span> : <Emblem level={who?.rank_level ?? 1} sex={who?.sex} size={20} />}
                  <strong>{mine ? 'You' : who?.display_name ?? '…'}</strong>
                  <span className="small muted">{timeAgo(m.created_at)}</span>
                  {isAdmin && (
                    <button className="link muted small chat-delete" onClick={() => remove(m)} aria-label="Delete message">Delete</button>
                  )}
                </div>
                <p className="chat-bubble">{m.message_text}</p>
              </li>
            );
          })}
        </ul>
      )}
      <div ref={endRef} />
      <form className="chat-compose" onSubmit={send}>
        <ErrorText>{error}</ErrorText>
        <div className="row gap">
          <input className="grow" value={text} maxLength={1000} placeholder="Message your cohort"
            onChange={(e) => setText(e.target.value)} aria-label="Message" />
          <button className="btn primary" disabled={busy || !text.trim()}>Send</button>
        </div>
      </form>
    </main>
  );
}
