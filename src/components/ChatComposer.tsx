import { useRef, useState, type FormEvent } from 'react';
import { prepareMedia, uploadChatMedia, type MediaType, type PickedMedia } from '../lib/chatMedia';
import { friendlyError } from '../lib/supabase';
import { Icon } from './Icon';
import { ErrorText } from './ui';

/**
 * Message box for every chat: text, plus an optional photo, GIF (memes too)
 * or short video. `onSend` saves the message and returns an error, if any.
 */
export default function ChatComposer({ userId, placeholder, note, onSend }: {
  userId: string; placeholder: string; note?: string;
  onSend: (text: string, media: { path: string; type: MediaType } | null) => Promise<string | null>;
}) {
  const [text, setText] = useState('');
  const [picked, setPicked] = useState<PickedMedia | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    setError('');
    try { setPicked(await prepareMedia(file)); } catch (e) { setError((e as Error).message); }
    if (fileRef.current) fileRef.current.value = '';
  }

  async function send(e: FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body && !picked) return;
    setBusy(true); setError('');
    try {
      const media = picked ? { path: await uploadChatMedia(userId, picked), type: picked.type } : null;
      const err = await onSend(body, media);
      if (err) { setError(err); return; }
      setText('');
      if (picked) URL.revokeObjectURL(picked.preview);
      setPicked(null);
    } catch (e2) {
      setError(friendlyError(e2));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="chat-compose" onSubmit={send}>
      <ErrorText>{error}</ErrorText>
      {picked && (
        <div className="compose-preview">
          {picked.type === 'video'
            ? <video src={picked.preview} muted playsInline />
            : <img src={picked.preview} alt="" />}
          <span className="small muted grow">{picked.type === 'video' ? 'Video' : picked.type === 'gif' ? 'GIF' : 'Photo'} ready to send</span>
          <button type="button" className="icon-btn small" aria-label="Remove attachment" onClick={() => setPicked(null)}>
            <Icon name="close" size={14} />
          </button>
        </div>
      )}
      <div className="row gap">
        <label className="icon-btn attach" aria-label="Add a photo, GIF or video">
          <Icon name="camera" size={18} />
          <input ref={fileRef} type="file" accept="image/*,video/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
        </label>
        <input className="grow" value={text} maxLength={1000} placeholder={placeholder}
          onChange={(e) => setText(e.target.value)} aria-label="Message" />
        <button className="btn primary" disabled={busy || (!text.trim() && !picked)}>{busy ? '…' : 'Send'}</button>
      </div>
      {note && <p className="dm-note">{note}</p>}
    </form>
  );
}
