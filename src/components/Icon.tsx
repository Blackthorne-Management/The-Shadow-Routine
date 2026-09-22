import type { Theme } from '../lib/types';

// Minimal monochrome line icons (24×24, stroke = currentColor).
const PATHS = {
  gym: 'M6 7v10M3 9.5v5M18 7v10M21 9.5v5M6 12h12',
  refraining: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM5.6 5.6l12.8 12.8',
  reading: 'M3 5h6a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H3zM21 5h-6a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h7z',
  nutrition: 'M5 19C5 11 11 5 19 5c0 8-6 14-14 14zM5 19l7-7',
  schedule: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2',
  word: 'M4 5h16v11H9l-5 4zM9 10.5l2 2 4-4',
  content: 'M4 12 20 4l-6 16-3-7z',
  other: 'M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3l-5.5 2.9 1-6.2L3 9.6l6.2-.9z',
  bolt: 'M13 2 4 14h7l-1 8 9-12h-7z',
  crown: 'M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z',
  bell: 'M6 16v-5a6 6 0 1 1 12 0v5l2 2H4zM10 21h4',
  camera: 'M4 7h3l2-3h6l2 3h3v13H4zM12 10a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z',
  video: 'M3 6h12v12H3zM15 10l6-3v10l-6-3',
  chat: 'M4 5h16v11H9l-5 4z',
  alert: 'M12 3 2 20h20zM12 10v4M12 17h.01',
  file: 'M14 3H6v18h12V7zM14 3v4h4',
  check: 'M5 12.5l4.5 4.5L19 7',
  hourglass: 'M6 3h12M6 21h12M7 3c0 6 10 6 10 9s-10 3-10 9M17 3c0 6-10 6-10 9s10 3 10 9',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  chevron: 'M9 6l6 6-6 6',
  back: 'M15 6l-6 6 6 6',
  close: 'M6 6l12 12M18 6 6 18',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.75}
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d={PATHS[name]} />
    </svg>
  );
}

export function ThemeIcon({ theme, size }: { theme: Theme; size?: number }) {
  return <Icon name={theme} size={size} />;
}
