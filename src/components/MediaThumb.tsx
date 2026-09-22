import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const isVideo = (path: string) => /\.(mp4|mov|webm|m4v|3gp|qt)$/i.test(path);

/** Small preview of a private photo/clip in the "proofs" bucket (signed URL). */
export default function MediaThumb({ path, size = 72, controls = false }: { path: string; size?: number; controls?: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    supabase.storage.from('proofs').createSignedUrl(path, 60 * 30).then(({ data }) => setUrl(data?.signedUrl ?? null));
  }, [path]);

  const style = { width: size, height: size };
  if (!url) return <div className="thumb skeleton" style={style} />;
  return isVideo(path)
    ? <video className="thumb" style={style} src={url} muted playsInline controls={controls} preload="metadata" />
    : <a href={url} target="_blank" rel="noreferrer"><img className="thumb" style={style} src={url} alt="Workout proof" /></a>;
}
