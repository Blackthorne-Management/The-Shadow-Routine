import type { ReactNode } from 'react';
import { useAuth } from '../lib/auth';
import type { Band } from '../lib/types';
import NotificationBell from './NotificationBell';

export function Wordmark() {
  return <span className="wordmark">SHADOW<i className="sun" aria-hidden /></span>;
}

/** The header: wordmark and an optional red pill. `scene` adds the temple-on-the-cliffs art. */
export function TopBar({ pill, pills, scene = false }: { pill?: ReactNode; pills?: ReactNode[]; scene?: boolean }) {
  return (
    <header className={`topbar ${scene ? 'scene' : ''}`}>
      <Wordmark />
      <div className="row gap">
        {[pill, ...(pills ?? [])].filter((p) => p != null).map((p, i) => <span key={i} className="level">{p}</span>)}
        <NotificationBell />
      </div>
    </header>
  );
}

export function Splash({ message, retry }: { message?: string; retry?: boolean }) {
  const { refresh, signOut } = useAuth();
  return (
    <main className="screen center">
      <img src="/icons/icon.svg" alt="" width={72} height={72} className="pulse" />
      {message && <p className="muted">{message}</p>}
      {retry && (
        <div className="row gap">
          <button className="btn" onClick={refresh}>Retry</button>
          <button className="btn" onClick={signOut}>Sign out</button>
        </div>
      )}
    </main>
  );
}

export function BandDot({ band, size = 11 }: { band?: Band | null; size?: number }) {
  return <span className={`dot band-${band ?? 'none'}`} style={{ width: size, height: size }} aria-label={band ?? 'no data yet'} />;
}

export function ProgressBar({ pct, band }: { pct: number; band?: Band | null }) {
  return (
    <div className="bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className={`bar-fill band-${band ?? 'none'}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
      <div className="bar-mark" style={{ left: '60%' }} />
      <div className="bar-mark" style={{ left: '80%' }} />
    </div>
  );
}

/** Segmented tick meter, e.g. 79% of 24 ticks lit. */
export function TickMeter({ pct, ticks = 24 }: { pct: number; ticks?: number }) {
  const on = Math.round((Math.min(100, Math.max(0, pct)) / 100) * ticks);
  return (
    <div className="ticks" aria-hidden>
      {Array.from({ length: ticks }, (_, i) => <span key={i} className={i < on ? 'on' : ''} />)}
    </div>
  );
}

export function ErrorText({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return <p className="error" role="alert">{children}</p>;
}

export function PageHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <div className="card">
      <div className="row between">
        <div>
          {subtitle && <p className="eyebrow">{subtitle}</p>}
          <h1>{title}</h1>
        </div>
        {right}
      </div>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}
