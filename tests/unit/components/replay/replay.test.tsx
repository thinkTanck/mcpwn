import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Replay } from '@/components/replay';
import { getDataSource } from '@/data/source';
import { SAMPLE_VERDICTS } from '@/data/fixtures/sample-verdicts';
import type { RunResult } from '@/contract';

/**
 * Live Attack Replay. These assertions exercise the RELIABLE base of the signal-
 * trace lane: the operable step timeline (a real <ol> of typed <button>s), the
 * transport, the fixed-height detail panel, and the verdict that stays SEALED
 * until the playhead reaches the compromise step. Everything binds to the real
 * sample RunResult, never a literal.
 */
async function sampleRun(): Promise<RunResult> {
  const run = await getDataSource().getRun('sample');
  if (!run) throw new Error('sample run missing');
  return run;
}

describe('Replay — binding + timeline', () => {
  it('binds the run id and step total to the real run (never a literal)', async () => {
    const run = await sampleRun();
    render(<Replay run={run} />);
    expect(screen.getByText(run.runId)).toBeInTheDocument();
    // Step total is the real length, and there is one timeline node per step.
    const timeline = screen.getByRole('list', { name: /step timeline/i });
    const nodes = within(timeline).getAllByRole('button');
    expect(nodes).toHaveLength(run.trace.steps.length);
  });

  it('badges exactly the compromise step from verdict.stepId', async () => {
    const run = await sampleRun();
    render(<Replay run={run} />);
    const compromiseNodes = screen.getAllByRole('button', { name: /compromise step/i });
    expect(compromiseNodes).toHaveLength(run.verdict.compromised ? 1 : 0);
  });
});

describe('Replay — transport', () => {
  it('exposes play, step, scrub and speed controls', async () => {
    const run = await sampleRun();
    render(<Replay run={run} />);
    expect(screen.getByRole('button', { name: /^Play$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /restart/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /previous step/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /next step/i })).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: /scrub to step/i })).toBeInTheDocument();
    // Discrete speed buttons (0.5x / 1x / 2x / 4x) in a labelled group.
    expect(screen.getByRole('group', { name: /playback speed/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '1×' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '4×' })).toBeInTheDocument();
  });
});

describe('Replay — header describes the run it shows', () => {
  it('derives the h1 narrative from the run category, never a hardcoded storyline', async () => {
    const run = await sampleRun();
    render(<Replay run={run} />);
    const heading = screen.getByRole('heading', { level: 1 });
    // The category code leads the title and the narrative is the ASI06 storyline
    // for the sample; a non-ASI06 run must not inherit "memory poisoning".
    expect(heading).toHaveTextContent(run.category);
    if (run.category !== 'ASI06') {
      expect(heading).not.toHaveTextContent(/memory poisoning/i);
    }
  });
});

describe('Replay — fix-report off-ramp', () => {
  it('links to the fix report for this run', async () => {
    const run = await sampleRun();
    render(<Replay run={run} />);
    // The verdict summary and the export are shown throughout (only the rationale
    // prose is sealed), so the off-ramp is available from the start.
    const link = screen.getByRole('link', { name: /fix report/i });
    expect(link).toHaveAttribute('href', `/findings/${run.verdict.runId}`);
  });
});

describe('sample verdicts — copy hygiene', () => {
  it('carries no em dashes in any rationale (UI copy rule)', () => {
    for (const [category, v] of Object.entries(SAMPLE_VERDICTS)) {
      expect(v.rationale, `${category} rationale`).not.toMatch(/—/);
    }
  });
});

describe('Replay — rationale sealed until the compromise step', () => {
  it('seals the rationale at the start and reveals it once the compromise step is reached', async () => {
    const run = await sampleRun();
    if (!run.verdict.compromised || !run.verdict.stepId)
      throw new Error('sample must be compromised');
    const user = userEvent.setup();
    render(<Replay run={run} />);

    // Sealed at step 0.
    expect(screen.getByText(/rationale sealed/i)).toBeInTheDocument();
    expect(screen.queryByText(run.verdict.rationale)).not.toBeInTheDocument();

    // Scrub to the compromise step by selecting its timeline node.
    const idx = run.trace.steps.findIndex((s) => s.id === run.verdict.stepId);
    const node = screen.getByRole('button', { name: new RegExp(`step ${idx + 1}:`, 'i') });
    await user.click(node);

    // Rationale unsealed; the offending-step number is shown (static identifier).
    expect(screen.queryByText(/rationale sealed/i)).not.toBeInTheDocument();
    expect(screen.getByText(run.verdict.rationale)).toBeInTheDocument();
  });
});
