import { render, screen, within } from '@testing-library/react';
import Home from '@/app/(hud)/page';
import { getDataSource } from '@/data/source';
import { CORE7 } from '@/components/home/core7';

/**
 * Home (BRAND register front door). Asserts the landmarks, the pitch + the
 * measured-detector claim, the Core-7 list, the CTAs, and — the load-bearing
 * invariant — that the run id + step total + compromise step are BOUND to the
 * real sample run, never literals.
 */

// Render the async Server Component to its resolved tree.
async function renderHome() {
  render(await Home());
}

describe('Home — landmarks & pitch', () => {
  it('exposes the hero as a region named by the level-1 pitch headline', async () => {
    await renderHome();
    const h1 = screen.getByRole('heading', { level: 1, name: /pwn your mcp agent/i });
    expect(h1).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /pwn your mcp agent/i })).toBeInTheDocument();
  });

  it('states the measured-detector claim with honest fixture provenance', async () => {
    await renderHome();
    // The pitch's emphasised claim: the detector accuracy was MEASURED.
    expect(screen.getByText('MEASURED')).toBeInTheDocument();
    // Provenance must be honest: a fixture, not a claimed benchmark.
    expect(screen.getByText(/fixture, not a benchmark/i)).toBeInTheDocument();
  });
});

describe('Home — Core-7 list', () => {
  it('lists all seven Core-7 categories with their pinned ids + titles', async () => {
    await renderHome();
    const nav = screen.getByRole('navigation', { name: /core-7 sample runs/i });
    expect(CORE7).toHaveLength(7);
    for (const c of CORE7) {
      expect(within(nav).getByText(c.id)).toBeInTheDocument();
      expect(within(nav).getByText(c.title)).toBeInTheDocument();
    }
  });

  it('pins the OWASP titles verbatim (and/&/(RCE) spellings)', () => {
    const byId = Object.fromEntries(CORE7.map((c) => [c.id, c.title]));
    expect(byId.ASI02).toBe('Tool Misuse and Exploitation');
    expect(byId.ASI03).toBe('Identity and Privilege Abuse');
    expect(byId.ASI04).toBe('Agentic Supply Chain Vulnerabilities');
    expect(byId.ASI05).toBe('Unexpected Code Execution (RCE)');
    expect(byId.ASI06).toBe('Memory & Context Poisoning');
  });
});

describe('Home — CTAs', () => {
  it('links "Try the sample" (PLAY) to /runs/sample', async () => {
    await renderHome();
    const play = screen.getByRole('link', { name: /play asi06 sample/i });
    expect(play).toHaveAttribute('href', '/runs/sample');
  });

  it('links "Connect your agent" to /connect', async () => {
    await renderHome();
    const connect = screen.getByRole('link', { name: /connect your agent/i });
    expect(connect).toHaveAttribute('href', '/connect');
  });
});

describe('Home — sample binding (never literals)', () => {
  it('binds the run id + step total + compromise step to the real sample run', async () => {
    const run = await getDataSource().getRun('sample');
    if (!run) throw new Error('sample run missing');
    const total = run.trace.steps.length;
    const idx = run.trace.steps.findIndex((s) => s.id === run.verdict.stepId) + 1;
    const offending = run.trace.steps[idx - 1];
    const tool = offending?.type === 'tool_call' ? offending.tool : '';

    const { container } = render(await Home());

    // Run id is surfaced (bound, not hardcoded RG-0472).
    expect(screen.getByText(run.runId)).toBeInTheDocument();

    // Step total is bound: the trailer draws exactly one dot per real step.
    const dots = container.querySelectorAll('[data-testid="trailer-dot"]');
    expect(dots).toHaveLength(total);

    // Compromise step index + offending tool are derived from verdict.stepId.
    expect(screen.getByText(new RegExp(`${idx}\\D+${tool}\\s+breach`, 'i'))).toBeInTheDocument();
    // The step-total readout matches the real length.
    expect(screen.getByText(new RegExp(`${total}\\s+steps`, 'i'))).toBeInTheDocument();
  });

  it('marks exactly one dot as the compromise step', async () => {
    const { container } = render(await Home());
    const breachDots = container.querySelectorAll(
      '[data-testid="trailer-dot"][data-breach="true"]',
    );
    expect(breachDots).toHaveLength(1);
  });
});
