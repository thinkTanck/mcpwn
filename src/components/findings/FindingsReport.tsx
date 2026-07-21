import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { StatusChip } from '@/components/hud';
import type { FixReport } from '@/data/source';
import { CopyReportButton } from './CopyReportButton';

/**
 * Section heading — an INSTRUMENT micro-label that is ALSO a real <h2>, so the
 * document keeps a clean heading outline (single h1 title → h2 sections) without
 * inventing a visible second-tier type. Tone tints the label per the design:
 * faint (default), cyan (remediation), breach (detector rationale).
 */
function SectionHeading({
  children,
  tone = 'faint',
}: {
  children: ReactNode;
  tone?: 'faint' | 'cyan' | 'breach';
}) {
  const toneClass =
    tone === 'cyan' ? 'text-nominal' : tone === 'breach' ? 'text-breach-text' : undefined;
  return <h2 className={cn('micro-label', toneClass)}>{children}</h2>;
}

/**
 * Findings / fix report — the editorial case file for a single run. Everything
 * binds from `report`: the header line reads `<category> · SEV <severity> · run
 * <runId>` straight off the record (no literals), and the prose blocks (impact,
 * root cause, remediation, rationale) render in the READING register (17px,
 * measure-capped) because they are sentences a human reads, not telemetry.
 */
export function FindingsReport({ report }: { report: FixReport }) {
  return (
    <article aria-label="Fix report" className="mx-auto max-w-[1440px] px-6 py-10 md:py-12">
      {/* Header: title + status + provenance line, with the copy control */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="micro-label text-nominal">Findings · Fix report</p>
          <h1 className="reading-h1 mt-3 max-w-[640px]">{report.title}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <StatusChip
              state={report.compromised ? 'breach' : 'nominal'}
              label={report.compromised ? 'COMPROMISED' : 'NOT COMPROMISED'}
            />
            <p className="instrument">
              <span>{report.category}</span>
              <span aria-hidden="true"> · </span>
              SEV <span className="text-breach-text">{report.severity}</span>
              <span aria-hidden="true"> · </span>
              run <span className="text-readout">{report.runId}</span>
            </p>
          </div>
        </div>
        <CopyReportButton report={report} />
      </header>

      {/* Offending step (telemetry) + impact (prose), side by side on desktop */}
      <div className="mt-8 grid gap-7 border-t border-line pt-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <section aria-label="Offending step">
          <SectionHeading>Offending step</SectionHeading>
          <p className="readout mt-2 text-breach-text">{report.offendingStep.label}</p>
          <dl className="mt-2 space-y-1">
            {report.offendingStep.lines.map(([k, v]) => (
              <div key={k} className="instrument flex gap-2">
                <dt className="text-ink-faint">{k}</dt>
                <dd className="min-w-0 break-words text-readout">{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section aria-label="Impact">
          <SectionHeading>Impact</SectionHeading>
          <p className="reading mt-2">{report.impact}</p>
        </section>
      </div>

      {/* Root cause (prose) */}
      <section aria-label="Root cause" className="mt-7 border-t border-line pt-5">
        <SectionHeading>Root cause</SectionHeading>
        <p className="reading mt-2">{report.rootCause}</p>
      </section>

      {/* Remediation — an ordered sequence, so numbering is meaningful */}
      <section aria-label="Remediation" className="mt-7 border-t border-line-em/40 pt-5">
        <SectionHeading tone="cyan">Remediation</SectionHeading>
        <ol aria-label="Remediation" className="mt-3">
          {report.remediation.map((step, i) => (
            <li
              key={step}
              className="flex items-baseline gap-4 border-t border-line/60 py-3 first:border-t-0"
            >
              <span
                aria-hidden="true"
                className="min-w-[1.75rem] font-sans text-[20px] font-semibold text-nominal"
              >
                {i + 1}
              </span>
              <p className="reading">{step}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Detector rationale (prose) */}
      <section aria-label="Detector rationale" className="mt-7 border-t border-breach/30 pt-5">
        <SectionHeading tone="breach">Detector rationale</SectionHeading>
        <p className="reading mt-2">{report.rationale}</p>
      </section>
    </article>
  );
}
