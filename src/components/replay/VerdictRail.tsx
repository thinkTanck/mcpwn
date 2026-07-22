'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { Verdict } from '@/contract';

/**
 * The detector verdict rail (Sentinel v2). The verdict SUMMARY — outcome,
 * category, severity, offending step — is shown throughout: this is a replay of a
 * known run, and the point is to watch HOW it happened. Only the detailed
 * RATIONALE prose is SEALED until the playhead reaches the compromise step
 * (verdict.stepId), so the reveal still lands at the anchor. Every identifier is
 * static — severity and the offending-step number are facts, never animated.
 */
export function VerdictRail({
  verdict,
  compromiseStepNumber,
  offendingLabel,
  revealed,
}: {
  verdict: Verdict;
  /** 1-based step number of verdict.stepId, or null if the run is clean. */
  compromiseStepNumber: number | null;
  /** Tool/label of the offending step, e.g. "send_email". */
  offendingLabel?: string;
  revealed: boolean;
}) {
  const compromised = verdict.compromised;

  return (
    <aside
      aria-label="Detector verdict"
      className="flex h-full flex-col gap-0 overflow-y-auto rounded-lg border border-line bg-panel p-5"
    >
      {/* Outcome pill */}
      <span
        className={cn(
          'inline-flex w-fit items-center gap-2.5 rounded-full border px-3 py-1.5 font-mono text-[14px] tracking-[0.14em]',
          compromised
            ? 'border-breach/40 text-breach-text shadow-glow-breach'
            : 'border-nominal/40 text-nominal shadow-glow-nominal',
        )}
      >
        <span className={cn('h-2 w-2 rounded-full', compromised ? 'bg-breach' : 'bg-nominal')} />
        {compromised ? 'COMPROMISED' : 'NOT COMPROMISED'}
      </span>

      {/* Verdict summary — always visible */}
      <p className="micro-label mt-5 border-t border-line pt-4 text-ink-faint">Detector verdict</p>
      <dl className="mt-2 flex flex-col gap-2.5 font-mono text-[15px]">
        <div className="flex items-baseline justify-between">
          <dt className="text-ink-muted">category</dt>
          <dd className="text-readout">{verdict.category}</dd>
        </div>
        <div className="flex items-baseline justify-between">
          <dt className="text-ink-muted">severity</dt>
          <dd className="text-breach-text">{verdict.severity}</dd>
        </div>
        {compromised && compromiseStepNumber !== null && (
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-ink-muted">offending step</dt>
            <dd className="text-right text-breach-text">
              #{compromiseStepNumber}
              {offendingLabel ? <span className="text-ink-muted"> {offendingLabel}</span> : null}
            </dd>
          </div>
        )}
      </dl>

      {/* Rationale — sealed until the compromise step is reached */}
      {revealed ? (
        <div className="verdict-in mt-4 rounded-md border border-breach/30 bg-breach/5 px-4 py-3.5">
          <p className="micro-label mb-2 text-breach-text">Rationale</p>
          <p className="reading text-ink">{verdict.rationale}</p>
        </div>
      ) : (
        <div className="mt-4 rounded-md border border-dashed border-line-em px-4 py-3.5">
          <p className="font-mono text-[14px] leading-relaxed text-ink-faint">
            Rationale sealed · reach the compromise step to unseal.
          </p>
        </div>
      )}

      {/* Off-ramp — the fix report carries the copy/export. The block ends here. */}
      <Link
        href={`/findings/${verdict.runId}`}
        className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-line-em bg-nominal/10 px-4 font-mono text-[14px] tracking-[0.1em] text-nominal transition-colors hover:bg-nominal/20 hover:shadow-glow-nominal"
      >
        Export fix report →
      </Link>
    </aside>
  );
}
