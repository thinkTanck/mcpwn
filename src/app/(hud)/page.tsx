import Link from 'next/link';
import { SentinelCore } from '@/components/hud';
import { Core7List } from '@/components/home/Core7List';
import { SampleTrailer } from '@/components/home/SampleTrailer';
import { getDataSource } from '@/data/source';
import {
  MEASURED_CLASSIFICATION,
  MEASURED_CLASSIFICATION_PROVENANCE,
  MEASURED_COMPROMISE,
  MEASURED_COMPROMISE_PROVENANCE,
} from '@/eval/measured';
import { offendingStepLabel } from '@/lib/hud/trace-view';
import type { RunResult, Step } from '@/contract';

/**
 * Home — the BRAND-register front door. The pitch + the measured-detector claim
 * + the Core-7 launcher + the sample trailer, composed to fit ONE viewport.
 *
 * Everything about the featured run is BOUND to the real sample `RunResult`
 * (run id, step total, compromise step) — no `RG-0472`/`/13` literals.
 *
 * TWO measured figures reach this screen, and they are structurally separated
 * because they are separate measurements: the compromise precision/recall, and
 * the category-classification accuracy (a different question over a smaller
 * denominator). Both live in `@/eval/measured`, each welded to its own
 * provenance line; neither may be edited here.
 */

/** Human-readable one-liner for a trace step (for the trailer end labels). */
function stepLabel(step: Step): string {
  switch (step.type) {
    case 'attacker':
      return 'attacker prompt';
    case 'agent_reasoning':
      return 'agent reasoning';
    case 'tool_call':
      return `${step.tool} call`;
    case 'tool_result':
      return `${step.tool} result`;
    case 'memory_read':
      return 'memory read';
    case 'memory_write':
      return 'memory write';
    case 'task_complete':
      return 'complete';
  }
}

/** Resolve the compromise step (1-based index + offending step name) from the verdict. */
function compromise(run: RunResult): { index: number; tool: string } {
  const steps = run.trace.steps;
  const index = steps.findIndex((s) => s.id === run.verdict.stepId) + 1;
  const step = steps[index - 1];
  return { index, tool: step ? offendingStepLabel(step) : run.verdict.category };
}

export default async function Home() {
  const ds = getDataSource();
  const [sample, runs] = await Promise.all([ds.getRun('sample'), ds.listRuns()]);
  if (!sample) throw new Error('sample run unavailable');

  const runById: Record<string, string> = Object.fromEntries(
    runs.map((r) => [r.category, r.runId]),
  );
  const runHref = (id: string) =>
    id === sample.category ? '/runs/sample' : `/runs/${runById[id] ?? 'sample'}`;

  const steps = sample.trace.steps;
  const total = steps.length;
  const first = steps[0];
  const last = steps[total - 1];
  const { index: compromiseIndex, tool: offendingTool } = compromise(sample);

  return (
    <div className="flex min-h-[calc(100dvh-62px)] items-start lg:items-center">
      <div className="mx-auto w-full max-w-[1400px] px-6 py-8">
        <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[1.3fr_0.8fr] lg:gap-10">
          {/* ── left: pitch + stat + CTAs + trailer ── */}
          <section aria-labelledby="home-title" className="flex min-w-0 flex-col gap-4">
            <h1 id="home-title" className="reading-h1 max-w-[22ch]">
              Pwn your MCP agent before an attacker does. Trust the verdict.
            </h1>

            <p className="reading-lead">
              Bring your own MCP agent and red-team it against the OWASP Agentic Top 10.
            </p>

            <p className="reading">
              Most tools only <span className="text-ink-muted">guess</span> whether an agent was
              compromised. We tested our detector against attacks with known outcomes and{' '}
              <span className="font-semibold text-nominal">measured</span> how accurate it is, so
              you can trust its verdicts.
            </p>

            {/* Detector accuracy readout. Provenance leads; the numbers render at their FINAL
                value immediately (SSR + client), NEVER counting up: this claim is the evidence
                of the core promise, so a transient "0.00 precision" would assert the opposite. */}
            <div
              role="group"
              aria-labelledby="metric-compromise-label"
              className="border-t border-line pt-3"
            >
              <div className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span id="metric-compromise-label" className="micro-label text-nominal">
                  Detector accuracy
                </span>
                <span className="instrument-faint">{MEASURED_COMPROMISE_PROVENANCE}</span>
              </div>
              <div className="flex items-baseline gap-x-6">
                <span className="whitespace-nowrap">
                  <span className="display-lg font-sans">
                    {MEASURED_COMPROMISE.precision.toFixed(2)}
                  </span>
                  <span className="instrument ml-2">precision</span>
                </span>
                <span className="whitespace-nowrap">
                  <span className="display-lg font-sans">
                    {MEASURED_COMPROMISE.recall.toFixed(2)}
                  </span>
                  <span className="instrument ml-2">recall</span>
                </span>
              </div>
            </div>

            {/* A SECOND measurement, deliberately in its own labelled group and at a smaller
                DISPLAY size. It answers a different question over a different denominator, so
                it must not sit in the row above as if it were a third view of one number.
                Subordinate in size because the product's claim is the compromise call; this
                qualifies which Core-7 code that compromise is filed under. */}
            <div
              role="group"
              aria-labelledby="metric-classification-label"
              className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-line/60 pt-3"
            >
              <span id="metric-classification-label" className="micro-label">
                Category classification
              </span>
              <span className="whitespace-nowrap">
                <span className="display-md font-sans">
                  {MEASURED_CLASSIFICATION.accuracy.toFixed(2)}
                </span>
                <span className="instrument ml-2">accuracy</span>
              </span>
              <span className="instrument-faint">{MEASURED_CLASSIFICATION_PROVENANCE}</span>
            </div>

            {/* CTAs */}
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-5">
                <Link
                  href="/runs/sample"
                  className="inline-flex items-center gap-2 rounded-md border border-nominal bg-nominal/10 px-6 py-3 font-mono text-[14px] tracking-[0.08em] text-readout shadow-glow-nominal transition-colors hover:bg-nominal/20"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                    <polygon points="2,1 11,6 2,11" fill="currentColor" />
                  </svg>
                  Play ASI06 sample
                </Link>
                <Link
                  href="/connect"
                  className="font-mono text-[14px] tracking-[0.06em] text-nominal hover:underline"
                >
                  Connect your agent →
                </Link>
              </div>
              {/* PROSE, not telemetry. Two complete sentences, the second an imperative
                  addressed to the reader; INSTRUMENT is labels, chips, metadata and cues, and
                  no label tells a human what to do. So it reads at READING body (17px sans),
                  on the muted tier so it stays subordinate to the CTAs above while clearing
                  AA. Adjudicated once; asserted in tests/unit/app/type-roles.test.ts. */}
              <p className="reading text-ink-muted">
                Featured run: memory poisoning. Pick any of the Core-7 to watch its own attack.
              </p>
            </div>

            <SampleTrailer
              runId={sample.runId}
              total={total}
              compromiseIndex={compromiseIndex}
              offendingTool={offendingTool}
              firstLabel={first ? stepLabel(first) : ''}
              lastLabel={last ? stepLabel(last) : ''}
              watchHref="/runs/sample"
            />
          </section>

          {/* ── right: sentinel core well + Core-7 launcher ── */}
          <div className="flex min-w-0 flex-col gap-4 lg:border-l lg:border-line lg:pl-8">
            <div className="relative flex aspect-[4/3] max-h-[240px] items-center justify-center overflow-hidden rounded-xl border border-line bg-[radial-gradient(120%_120%_at_50%_40%,color-mix(in_srgb,var(--cyan-700)_16%,transparent),var(--surface-base)_70%)]">
              <SentinelCore
                size={200}
                label="Sentinel core: the detector reads only the observable trace"
                className="relative z-10"
              />
              <svg
                viewBox="0 0 560 560"
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
              >
                <ellipse
                  cx="280"
                  cy="280"
                  rx="212"
                  ry="74"
                  transform="rotate(20 280 280)"
                  className="fill-none stroke-nominal"
                  strokeWidth="1.1"
                  opacity="0.4"
                />
                <ellipse
                  cx="280"
                  cy="280"
                  rx="150"
                  ry="204"
                  transform="rotate(-14 280 280)"
                  className="fill-none stroke-nominal"
                  strokeWidth="1.1"
                  opacity="0.28"
                />
                <ellipse
                  cx="280"
                  cy="280"
                  rx="118"
                  ry="196"
                  transform="rotate(62 280 280)"
                  className="fill-none stroke-nominal"
                  strokeWidth="1"
                  opacity="0.2"
                />
              </svg>
            </div>

            <Core7List runHref={runHref} />
          </div>
        </div>
      </div>
    </div>
  );
}
