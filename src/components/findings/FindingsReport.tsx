import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { StatusChip } from '@/components/hud';
import { stepMeta, stepPayload } from '@/components/replay/step-meta';
import type { FixReport } from '@/fix-report';
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
 * Findings / fix report — the editorial case file for a single run, rendered from
 * the REAL module-6 `FixReport` (`generateFixReport`). It used to render a
 * hand-authored fixture shaped to the screen while the generator shipped dark
 * behind it; everything here now binds from the artifact the product actually
 * produces.
 *
 * The header line reads `<category> · SEV <severity> · run <runId>` straight off
 * the record (no literals), the offending step is QUOTED from the observable
 * trace, and the prose blocks (rationale, remediation) render in the READING
 * register because they are sentences a human reads, not telemetry.
 *
 * `provenance` says where the verdict came from. It is optional because a live
 * run's provenance is not this component's to invent: the DataSource supplies it,
 * and when it cannot, nothing is claimed.
 */
export function FindingsReport({
  report,
  provenance,
}: {
  report: FixReport;
  provenance?: string | null;
}) {
  const finding = report.finding;
  const step = finding?.step;

  return (
    <article aria-label="Fix report" className="mx-auto max-w-[1440px] px-6 py-10 md:py-12">
      {/* Header: title + status + provenance line, with the copy control */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="micro-label text-nominal">Findings · Fix report</p>
          <h1 className="reading-h1 mt-3 max-w-[640px]">
            {finding ? finding.categoryTitle : 'No findings'}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <StatusChip
              state={report.compromised ? 'breach' : 'nominal'}
              label={report.compromised ? 'COMPROMISED' : 'NOT COMPROMISED'}
            />
            <p className="instrument">
              {finding ? (
                <>
                  <span>{finding.category}</span>
                  <span aria-hidden="true"> · </span>
                  SEV <span className="text-breach-text">{finding.severity}</span>
                  <span aria-hidden="true"> · </span>
                </>
              ) : null}
              run <span className="text-readout">{report.runId}</span>
            </p>
          </div>
          <p className="instrument mt-2 text-ink-faint">
            target <span className="text-readout">{report.target}</span>
            <span aria-hidden="true"> · </span>
            model <span className="text-readout">{report.model}</span>
          </p>
          {provenance ? <p className="instrument mt-1 text-ink-faint">{provenance}</p> : null}
        </div>
        <CopyReportButton report={report} />
      </header>

      {finding && step ? (
        <>
          {/* Offending step (telemetry) + summary (prose), side by side on desktop */}
          <div className="mt-8 grid gap-7 border-t border-line pt-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            <section aria-label="Offending step">
              <SectionHeading>Offending step</SectionHeading>
              <p className="readout mt-2 text-breach-text">
                {`#${finding.stepIndex} · ${stepMeta(step.type).label}`}
              </p>
              <dl className="mt-2 space-y-1">
                {stepPayload(step).map((row) => (
                  <div key={row.k} className="instrument flex gap-2">
                    <dt className="text-ink-faint">{row.k}</dt>
                    <dd className="min-w-0 break-words text-readout">{row.v}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <section aria-label="Summary">
              <SectionHeading>Summary</SectionHeading>
              <p className="reading mt-2">{report.summary}</p>
            </section>
          </div>

          {/* Detector rationale (prose, quoted from the judge) */}
          <section aria-label="Detector rationale" className="mt-7 border-t border-breach/30 pt-5">
            <SectionHeading tone="breach">Detector rationale</SectionHeading>
            <p className="reading mt-2">{finding.rationale}</p>
          </section>

          {/* Remediation — an ordered sequence, so numbering is meaningful */}
          <section aria-label="Remediation" className="mt-7 border-t border-line-em/40 pt-5">
            <SectionHeading tone="cyan">Remediation</SectionHeading>
            <ol aria-label="Remediation" className="mt-3">
              {finding.remediation.steps.map((remedy, i) => (
                <li
                  key={remedy}
                  className="flex items-baseline gap-4 border-t border-line/60 py-3 first:border-t-0"
                >
                  <span
                    aria-hidden="true"
                    className="min-w-[1.75rem] font-sans text-[20px] font-semibold text-nominal"
                  >
                    {i + 1}
                  </span>
                  <p className="reading">{remedy}</p>
                </li>
              ))}
            </ol>
            <p className="instrument mt-4 text-ink-faint">{finding.remediation.reference}</p>
          </section>
        </>
      ) : (
        <section aria-label="Summary" className="mt-8 border-t border-line pt-6">
          <SectionHeading>Summary</SectionHeading>
          <p className="reading mt-2 max-w-[640px]">{report.summary}</p>
        </section>
      )}
    </article>
  );
}
