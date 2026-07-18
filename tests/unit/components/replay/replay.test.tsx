import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Replay } from '@/components/replay';
import { getDataSource } from '@/data/source';
import type { RunResult } from '@/contract';

/**
 * Live Attack Replay. In jsdom there is no WebGL and no desktop media match, so
 * the orbital enhancement never mounts and these assertions exercise the RELIABLE
 * base: the operable step timeline, the transport, the fixed-height detail panel,
 * and the verdict that stays SEALED until the playhead reaches the compromise
 * step. Everything binds to the real sample RunResult, never a literal.
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
    expect(screen.getByRole('button', { name: /previous step/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /next step/i })).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: /scrub to step/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /playback speed/i })).toBeInTheDocument();
  });
});

describe('Replay — verdict sealed until the compromise step', () => {
  it('seals the rationale at the start and reveals it once the compromise step is reached', async () => {
    const run = await sampleRun();
    if (!run.verdict.compromised || !run.verdict.stepId)
      throw new Error('sample must be compromised');
    const user = userEvent.setup();
    render(<Replay run={run} />);

    // Sealed at step 0.
    expect(screen.getByText(/verdict sealed/i)).toBeInTheDocument();
    expect(screen.queryByText(run.verdict.rationale)).not.toBeInTheDocument();

    // Scrub to the compromise step by selecting its timeline node.
    const idx = run.trace.steps.findIndex((s) => s.id === run.verdict.stepId);
    const node = screen.getByRole('button', { name: new RegExp(`step ${idx + 1}:`, 'i') });
    await user.click(node);

    // Rationale unsealed; the offending-step number is shown (static identifier).
    expect(screen.queryByText(/verdict sealed/i)).not.toBeInTheDocument();
    expect(screen.getByText(run.verdict.rationale)).toBeInTheDocument();
  });
});
