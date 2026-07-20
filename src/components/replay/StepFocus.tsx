import { cn } from '@/lib/utils';
import type { Step } from '@/contract';
import { stepMeta, stepSummary, type NodeBand } from './step-meta';

/**
 * The "now playing" focal card above the timeline rail. It carries the ACTIVE
 * step's identity so the rail never has to (13 per-node captions collided into an
 * unreadable smear — this is where the current label lives instead). The big step
 * numeral is the replay's DISPLAY moment; it is the playhead POSITION, not a
 * quoted trace value, so it may change as playback advances — but it switches
 * discretely, never counts up.
 *
 * The band colour is applied inline as a token var, not a `text-*` utility: the
 * DISPLAY role sets its colour through an unlayered `:where()` rule that outranks
 * any layered utility, so only an inline style (or the token var) wins (the same
 * pattern the coverage board and the brand SVG use).
 */
function bandColor(band: NodeBand, breach: boolean): string {
  if (breach) return 'var(--text-breach)';
  if (band === 'nominal') return 'var(--status-nominal)';
  if (band === 'caution') return 'var(--status-caution)';
  return 'var(--text-hi)';
}

export function StepFocus({
  step,
  index,
  total,
  compromised,
}: {
  step: Step;
  index: number;
  total: number;
  compromised: boolean;
}) {
  const meta = stepMeta(step.type);
  const accent = bandColor(meta.band, compromised);
  return (
    <div className="flex items-center gap-4 sm:gap-5">
      <span
        aria-hidden="true"
        className="display-xl font-sans leading-none tabular-nums"
        style={{ color: accent }}
      >
        {String(index + 1).padStart(2, '0')}
      </span>
      <div className="flex min-w-0 flex-col gap-1">
        <span className="micro-label" style={{ color: accent }}>
          {compromised ? `${meta.tag} · BREACH` : meta.tag}
        </span>
        <span className="reading-lead font-semibold text-ink-hi">{meta.label}</span>
        <span className="reading truncate text-ink-muted">{stepSummary(step)}</span>
      </div>
      <span className="instrument ml-auto shrink-0 self-start text-ink-faint">
        step {index + 1} / {total}
      </span>
    </div>
  );
}
