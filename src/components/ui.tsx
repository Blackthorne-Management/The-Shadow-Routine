import type { ReactNode } from 'react';
import { useAuth } from '../lib/auth';
import type { Band } from '../lib/types';

export function Splash({ message, retry }: { message?: string; retry?: boolean }) {
  const { refresh, signOut } = useAuth();
  return (
    <main className="screen center">
      <img src="/icons/icon.svg" alt="" width={72} height={72} className="pulse" />
      {message && <p className="muted">{message}</p>}
      {retry && (
        <div className="row gap">
          <button className="btn ghost" onClick={refresh}>Retry</button>
          <button className="btn ghost" onClick={signOut}>Sign out</button>
        </div>
      )}
    </main>
  );
}

export function BandDot({ band, size = 10 }: { band?: Band; size?: number }) {
  return <span className={`dot band-${band ?? 'none'}`} style={{ width: size, height: size }} aria-label={band ?? 'no data'} />;
}

export function ProgressBar({ pct, band }: { pct: number; band?: Band }) {
  return (
    <div className="bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className={`bar-fill band-${band ?? 'none'}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
      <div className="bar-mark" style={{ left: '60%' }} />
      <div className="bar-mark" style={{ left: '80%' }} />
    </div>
  );
}

export function ErrorText({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return <p className="error" role="alert">{children}</p>;
}

export function PageHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <header className="page-header">
      <div>
        {subtitle && <p className="eyebrow">{subtitle}</p>}
        <h1>{title}</h1>
      </div>
      {right}
    </header>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}
