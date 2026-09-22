import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

/** Shows a private proof file via a short-lived signed URL. */
export default function ProofPreview({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    supabase.storage.from('proofs').createSignedUrl(path, 60 * 30).then(({ data }) => setUrl(data?.signedUrl ?? null));
  }, [path]);

  if (!url) return <div className="proof-media skeleton" />;
  const isVideo = /\.(mp4|mov|webm|m4v|3gp)$/i.test(path);
  return isVideo
    ? <video className="proof-media" src={url} controls playsInline preload="metadata" />
    : <a href={url} target="_blank" rel="noreferrer"><img className="proof-media" src={url} alt="Proof" /></a>;
}
