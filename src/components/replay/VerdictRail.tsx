'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { Verdict } from '@/contract';

/**
 * The detector verdict, PINNED to the compromise step. It stays SEALED until the
 * playhead reaches that step (verdict.stepId); revealing it before the run gets
 * there would spoil the anchor the replay exists to show. Once revealed, every
 * identifier is static: severity, score, and the offending-step number are facts,
 * not magnitudes, and never animate. The rationale is READING prose.
 */
export function VerdictRail({
  verdict,
  compromiseStepNumber,
  revealed,
}: {
  verdict: Verdict;
  /** 1-based step number of verdict.stepId, or null if the run is clean. */
  compromiseStepNumber: number | null;
  revealed: boolean;
}) {
  const compromised = verdict.compromised;

  if (!revealed) {
    return (
      <aside
        aria-label="Detector verdict"
        className="flex h-full flex-col justify-center gap-3 rounded-lg border border-line bg-panel px-5 py-6 text-center"
      >
        <span aria-hidden="true" className="mx-auto text-ink-faint">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <rect
              x="5"
              y="10"
              width="14"
              height="10"
              rx="2"
              stroke="currentColor"
              strokeWidth="1.4"
            />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.4" />
          </svg>
        </span>
        <p className="micro-label text-ink-faint">Verdict sealed</p>
        <p className="reading text-ink-muted">
          The detector&rsquo;s verdict unseals when the replay reaches the compromise step. Play on,
          or scrub ahead.
        </p>
      </aside>
    );
  }

  return (
    <aside
      aria-label="Detector verdict"
      className={cn(
        'verdict-in flex h-full flex-col gap-3 rounded-lg border bg-panel px-5 py-5',
        compromised ? 'border-breach/40' : 'border-nominal/40',
      )}
    >
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className={cn(
            'inline-flex h-6 items-center gap-2 rounded-full border px-2.5 font-mono text-[12px] uppercase tracking-[0.1em]',
            compromised
              ? 'border-breach/50 text-breach-text shadow-glow-breach'
              : 'border-nominal/50 text-nominal shadow-glow-nominal',
          )}
        >
          <span
            className={cn('h-1.5 w-1.5 rounded-full', compromised ? 'bg-breach' : 'bg-nominal')}
          />
          {compromised ? 'COMPROMISED' : 'NOT COMPROMISED'}
        </span>
      </div>

      <dl className="flex flex-wrap gap-x-6 gap-y-1 font-mono text-[13px]">
        <div className="flex items-baseline gap-2">
          <dt className="text-ink-faint">SEV</dt>
          <dd className="text-breach-text">{verdict.severity}</dd>
        </div>
        {compromised && compromiseStepNumber !== null && (
          <div className="flex items-baseline gap-2">
            <dt className="text-ink-faint">STEP</dt>
            <dd className="text-readout">{String(compromiseStepNumber).padStart(2, '0')}</dd>
          </div>
        )}
        <div className="flex items-baseline gap-2">
          <dt className="text-ink-faint">CATEGORY</dt>
          <dd className="text-readout">{verdict.category}</dd>
        </div>
      </dl>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <p className="micro-label mb-1.5 text-nominal">Detector rationale</p>
        <p className="reading">{verdict.rationale}</p>
      </div>

      {compromised && (
        // The off-ramp to engineering: the fix report carries the copy/export.
        <Link
          href={`/findings/${verdict.runId}`}
          className="inline-flex min-h-11 w-fit items-center gap-2 rounded-md border border-line-em bg-nominal/10 px-4 font-mono text-[12px] tracking-[0.06em] text-readout transition-colors hover:bg-nominal/20"
        >
          <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="M4 2h6l3 3v9H4z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinejoin="round"
            />
            <path d="M10 2v3h3" fill="none" stroke="currentColor" strokeWidth="1.3" />
          </svg>
          Open fix report →
        </Link>
      )}
    </aside>
  );
}
