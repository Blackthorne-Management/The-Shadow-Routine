import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { supabase, friendlyError } from '../lib/supabase';
import { timeAgo } from '../lib/dates';
import type { ChatMessage } from '../lib/types';
import { Empty, ErrorText, TopBar } from '../components/ui';
import { DirectList, Who, loadPeople, type Person } from './DirectMessages';
import { isStaff, staffLabel } from '../lib/roles';
import { useViewCohorts } from '../lib/cohorts';
import { useDmUnread } from '../lib/badges';
import ChatComposer from '../components/ChatComposer';
import { Bubble } from '../components/ChatMedia';
import type { MediaType } from '../lib/chatMedia';


/**
 * Chat: Direct messages, your cohort, and Global (everyone, across cohorts). Text only, live via Realtime. Staff can post
 * anywhere and delete group messages.
 */
export default function Chat() {
  const { profile } = useAuth();
  const isAdmin = isStaff(profile);
  // Staff can read every cohort they mentor (Admins: all); they pick which one
  const { choices: chatCohorts, current: cohort, setPick, name: cohortName, names: cohortNames } = useViewCohorts(profile);
  const [params, setParams] = useSearchParams();
  const tab = params.get('c');
  const channel: 'cohort' | 'global' | 'direct' = tab === 'global' ? 'global' : tab === 'direct' ? 'direct' : 'cohort';
  const unread = useDmUnread(profile?.id);
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [members, setMembers] = useState<Map<string, Person>>(new Map());
  const [error, setError] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  const loadMembers = useCallback(async () => {
    setMembers(await loadPeople());
  }, []);

  useEffect(() => {
    if (!cohort || channel === 'direct') return;
    setMessages(null);
    loadMembers();
    let q = supabase.from('messages').select('*').eq('channel', channel);
    if (channel === 'cohort') q = q.eq('cohort_id', cohort);
    q.order('created_at', { ascending: false }).limit(200)
      .then(({ data }) => setMessages(((data as ChatMessage[]) ?? []).reverse()));

    const filter = channel === 'cohort' ? `cohort_id=eq.${cohort}` : 'channel=eq.global';
    const ch = supabase.channel(`chat-${channel}-${cohort}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter },
        (p) => {
          const m = p.new as ChatMessage;
          setMessages((list) => (list?.some((x) => x.id === m.id) ? list : [...(list ?? []), m]));
          setMembers((mm) => { if (!mm.has(m.user_id)) loadMembers(); return mm; });
        })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' },
        (p) => setMessages((list) => list?.filter((x) => x.id !== (p.old as ChatMessage).id) ?? null))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [cohort, channel, loadMembers]);

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [messages?.length]);

  async function send(body: string, media: { path: string; type: MediaType } | null) {
    if (!profile || !cohort || channel === 'direct') return null;
    const { data, error } = await supabase.from('messages')
      .insert({ channel, cohort_id: channel === 'cohort' ? cohort : null, user_id: profile.id, message_text: body,
                media_path: media?.path ?? null, media_type: media?.type ?? null }).select().single();
    if (error) return friendlyError(error);
    setMessages((list) => (list?.some((x) => x.id === data.id) ? list : [...(list ?? []), data as ChatMessage]));
    return null;
  }

  async function remove(m: ChatMessage) {
    if (!confirm('Delete this message for everyone?')) return;
    const { error } = await supabase.from('messages').delete().eq('id', m.id);
    if (error) setError(friendlyError(error));
    else setMessages((list) => list?.filter((x) => x.id !== m.id) ?? null);
  }

  return (
    <main className="screen with-tabs chat-screen">
      <TopBar pill={isAdmin ? `${staffLabel(profile)} view` : 'Chat'} />
      <div className="seg">
        <button className={channel === 'direct' ? 'on' : ''} onClick={() => setParams({ c: 'direct' })}>
          Direct{unread > 0 && <> <span className="count-badge">{unread}</span></>}
        </button>
        <button className={channel === 'cohort' ? 'on' : ''} onClick={() => setParams({})}>{cohortName ?? 'Cohort'}</button>
        <button className={channel === 'global' ? 'on' : ''} onClick={() => setParams({ c: 'global' })}>Global</button>
      </div>
      {channel === 'cohort' && chatCohorts.length > 1 && (
        <select value={cohort ?? ''} onChange={(e) => setPick(e.target.value)} aria-label="Cohort">
          {chatCohorts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      )}
      {channel === 'direct' ? <DirectList /> : <>
      {!messages ? <div className="skeleton-list" /> : messages.length === 0 ? (
        <Empty>{channel === 'cohort' ? `No messages yet. Say something to ${cohortName ?? 'your cohort'}.` : 'No messages yet. Global reaches everyone, across every cohort.'}</Empty>
      ) : (
        <ul className="chat-list">
          {messages.map((m) => {
            const who = members.get(m.user_id);
            const mine = m.user_id === profile?.id;
            const mentor = isStaff(who);
            return (
              <li key={m.id} className={`chat-msg ${mine ? 'mine' : ''} ${mentor ? 'mentor' : ''}`}>
                <div className="chat-meta">
                  <Who p={who} />
                  <strong>{mine ? 'You' : who?.display_name ?? '…'}</strong>
                  {channel === 'global' && who?.cohort_id && cohortNames.get(who.cohort_id) && (
                    <span className="small muted">{cohortNames.get(who.cohort_id)}</span>
                  )}
                  <span className="small muted">{timeAgo(m.created_at)}</span>
                  {isAdmin && (
                    <button className="link muted small chat-delete" onClick={() => remove(m)} aria-label="Delete message">Delete</button>
                  )}
                </div>
                <Bubble m={m} />
              </li>
            );
          })}
        </ul>
      )}
      <div ref={endRef} />
      <ErrorText>{error}</ErrorText>
      {profile && (
        <ChatComposer userId={profile.id} onSend={send}
          placeholder={channel === 'cohort' ? `Message ${cohortName ?? 'your cohort'}` : 'Message everyone (global)'} />
      )}
      </>}
    </main>
  );
}
