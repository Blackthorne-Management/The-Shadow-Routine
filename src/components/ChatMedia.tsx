import { useEffect, useState } from 'react';
import { chatMediaUrl, type MediaType } from '../lib/chatMedia';

/** A photo, GIF or video inside a chat bubble (private "chat" bucket, signed URL). */
export default function ChatMedia({ path, type }: { path: string; type: MediaType }) {
  const [url, setUrl] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let live = true;
    chatMediaUrl(path).then((u) => { if (live) setUrl(u); });
    return () => { live = false; };
  }, [path]);

  if (!url) return <div className="chat-media skeleton" />;
  if (type === 'video') return <video className="chat-media" src={url} controls playsInline preload="metadata" />;
  return (
    <>
      <button type="button" className="chat-media-btn" onClick={() => setOpen(true)} aria-label="Open image">
        <img className="chat-media" src={url} alt={type === 'gif' ? 'GIF' : 'Photo'} loading="lazy" />
      </button>
      {open && (
        <div className="lightbox" role="dialog" aria-label="Image" onClick={() => setOpen(false)}>
          <img src={url} alt="" />
        </div>
      )}
    </>
  );
}

/** A chat bubble: optional media, then the text. */
export function Bubble({ m }: { m: { message_text: string; media_path?: string | null; media_type?: MediaType | null } }) {
  if (!m.media_path || !m.media_type) return <p className="chat-bubble">{m.message_text}</p>;
  return (
    <div className="chat-bubble has-media">
      <ChatMedia path={m.media_path} type={m.media_type} />
      {m.message_text.trim() && <p className="chat-text">{m.message_text}</p>}
    </div>
  );
}
