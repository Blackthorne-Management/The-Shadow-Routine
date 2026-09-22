import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { titleFor } from '../lib/ranks';
import type { Sex } from '../lib/types';

// Emblem art lives in public.emblems.image_url. Until the real artwork is
// dropped in, a placeholder badge is drawn so layouts are proven out.
type ArtMap = Record<string, string | null>;
let artCache: Promise<ArtMap> | null = null;
function loadArt(): Promise<ArtMap> {
  artCache ??= Promise.resolve(supabase.from('emblems').select('rank_level,path,image_url')).then(({ data }) =>
    Object.fromEntries((data ?? []).map((e) => [`${e.rank_level}:${e.path}`, e.image_url])));
  return artCache;
}

const pathFor = (level: number, sex: Sex | null | undefined) => (level >= 10 ? 'shared' : sex === 'female' ? 'female' : 'male');

export default function Emblem({ level, sex, size = 28 }: { level: number; sex?: Sex | null; size?: number }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    loadArt().then((m) => { if (live) setUrl(m[`${level}:${pathFor(level, sex)}`] ?? null); });
    return () => { live = false; };
  }, [level, sex]);

  const title = titleFor(level, sex);
  if (url) return <img className="emblem" src={url} width={size} height={size} alt={title} title={title} />;

  // Placeholder: a faceted shield, lavender for The Eclipse, with the level number
  const eclipse = level >= 10;
  return (
    <svg className={`emblem ${eclipse ? 'eclipse' : ''}`} width={size} height={size} viewBox="0 0 32 32" role="img" aria-label={title}>
      <title>{title}</title>
      <path d="M16 2 28 7v9c0 7-5.2 12.3-12 14C9.2 28.3 4 23 4 16V7z" className="emblem-shield" />
      <path d="M16 5.5 25 9.3v6.8c0 5.3-3.8 9.4-9 10.8-5.2-1.4-9-5.5-9-10.8V9.3z" className="emblem-inner" />
      <text x="16" y="20.5" textAnchor="middle" className="emblem-num">{eclipse ? '◐' : level}</text>
    </svg>
  );
}
