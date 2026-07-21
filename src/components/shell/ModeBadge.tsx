import { cn } from '@/lib/utils';

export type Mode = 'sample' | 'live';

/** Run-mode indicator in the status bar. The label names the mode (SAMPLE / LIVE) — never color-only. */
export function ModeBadge({ mode = 'sample' }: { mode?: Mode }) {
  const live = mode === 'live';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-3 py-1.5',
        live ? 'border-nominal bg-nominal/10 shadow-glow-nominal' : 'border-line-em bg-nominal/5',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'h-2 w-2 rounded-full',
          live ? 'bg-nominal shadow-glow-nominal' : 'border border-line-em',
        )}
      />
      <span
        className={cn(
          'font-mono text-[14px] font-medium tracking-[0.12em]',
          live ? 'text-readout' : 'text-ink-muted',
        )}
      >
        {live ? 'LIVE' : 'SAMPLE'}
      </span>
    </span>
  );
}
