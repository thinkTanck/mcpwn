'use client';

import { cn } from '@/lib/utils';

/**
 * Replay transport: play/pause, step back/forward, a scrub slider, and a speed
 * cycle. The STEP n / total readout reflects the playhead POSITION as it moves —
 * that is position, not an animated fact, so it may update live. The run id, step
 * total, severity, and offending-step number are static elsewhere and never tick.
 */
function ctrlClass(disabled?: boolean): string {
  return cn(
    'inline-flex h-9 min-w-9 items-center justify-center gap-1.5 rounded-md border border-line px-2.5 font-mono text-[12px] text-ink transition-colors',
    disabled
      ? 'cursor-not-allowed opacity-40'
      : 'hover:border-line-em hover:bg-nominal/[0.06] hover:text-ink-hi',
  );
}

export function Transport({
  current,
  total,
  playing,
  speed,
  onPlayToggle,
  onStep,
  onScrub,
  onSpeed,
}: {
  current: number;
  total: number;
  playing: boolean;
  speed: number;
  onPlayToggle: () => void;
  onStep: (delta: number) => void;
  onScrub: (index: number) => void;
  onSpeed: () => void;
}) {
  const atStart = current <= 0;
  const atEnd = current >= total - 1;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-panel px-3 py-2.5">
      <button
        type="button"
        onClick={() => onStep(-1)}
        disabled={atStart}
        className={ctrlClass(atStart)}
        aria-label="Previous step"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M8 2v8M8 6L3 2v8z" fill="currentColor" />
        </svg>
      </button>

      <button
        type="button"
        onClick={onPlayToggle}
        className={cn(
          ctrlClass(),
          'border-nominal bg-nominal/10 px-4 text-readout shadow-glow-nominal',
        )}
        aria-label={playing ? 'Pause' : 'Play'}
      >
        {playing ? (
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <rect x="2.5" y="2" width="2.5" height="8" fill="currentColor" />
            <rect x="7" y="2" width="2.5" height="8" fill="currentColor" />
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <polygon points="3,2 10,6 3,10" fill="currentColor" />
          </svg>
        )}
        {playing ? 'PAUSE' : 'PLAY'}
      </button>

      <button
        type="button"
        onClick={() => onStep(1)}
        disabled={atEnd}
        className={ctrlClass(atEnd)}
        aria-label="Next step"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M4 2v8M4 6l5-4v8z" fill="currentColor" />
        </svg>
      </button>

      <label className="flex min-w-[140px] flex-1 items-center gap-2">
        <span className="sr-only">Scrub to step</span>
        <input
          type="range"
          min={0}
          max={total - 1}
          step={1}
          value={current}
          onChange={(e) => onScrub(Number(e.target.value))}
          aria-label="Scrub to step"
          aria-valuetext={`Step ${current + 1} of ${total}`}
          className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-line accent-[color:var(--status-nominal)]"
        />
      </label>

      <button
        type="button"
        onClick={onSpeed}
        className={ctrlClass()}
        aria-label={`Playback speed ${speed}x`}
      >
        {speed}&times;
      </button>

      <span className="font-mono text-[13px] tabular-nums text-readout" aria-live="off">
        STEP {String(current + 1).padStart(2, '0')}
        <span className="text-ink-faint"> / {String(total).padStart(2, '0')}</span>
      </span>
    </div>
  );
}
