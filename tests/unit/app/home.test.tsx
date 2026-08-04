import { render, screen, within } from '@testing-library/react';
import Home from '@/app/(hud)/page';
import { getDataSource } from '@/data/source';
import { CORE7 } from '@/components/home/core7';
import { offendingStepLabel } from '@/lib/hud/trace-view';
import { MEASURED_CLASSIFICATION, MEASURED_CLASSIFICATION_PROVENANCE } from '@/eval/measured';

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

  it('states the measured-detector claim in the pitch', async () => {
    await renderHome();
    // The pitch's emphasised claim: the detector accuracy was measured. Emphasis is
    // sans weight+colour, never the mono INSTRUMENT role (prose never wears it).
    expect(screen.getByText('measured')).toBeInTheDocument();
  });

  it('couples the word "measured" to a real figure and its full provenance', async () => {
    await renderHome();
    // THE GUARD. The chip sits directly under the precision/recall numbers, so
    // whatever it says is a claim ABOUT THOSE NUMBERS. It once read "measured ·
    // leakage-separated fixture" while the values were illustrative constants no
    // judge had ever produced, which is the pitch's promise leaking onto the
    // evidence. It later read "illustrative" precisely because no measurement
    // existed yet.
    //
    // Both of those states are now wrong: the figures ARE measured. So the guard
    // inverts rather than relaxes. It no longer asks "is the word absent" — it
    // demands the word AND everything needed to check the claim: how many
    // realizations, how many passes, when, and by which judge. A number that
    // loses any part of its provenance fails here, and so does provenance with
    // no number.
    const chip = screen.getByText(/^measured ·/);
    expect(chip.textContent).toMatch(/N=44 labeled realizations/);
    expect(chip.textContent).toMatch(/5 passes/);
    expect(chip.textContent).toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(chip.textContent).toMatch(/judge claude-haiku-4-5/);
    // The figures themselves must be present and non-zero next to it.
    expect(screen.getByText('0.96')).toBeInTheDocument();
    expect(screen.getByText('1.00')).toBeInTheDocument();
  });

  it('never re-labels the measured figures as illustrative or a fixture', async () => {
    await renderHome();
    // The reverse drift: quietly downgrading the claim while leaving real numbers
    // on screen would be just as untrue as the original overclaim.
    const chip = screen.getByText(/^measured ·/);
    expect(chip.textContent).not.toMatch(/illustrative/i);
    expect(chip.textContent).not.toMatch(/fixture, not a benchmark/i);
  });
});

describe('Home — category classification is a SECOND, separate measurement', () => {
  it('renders the classification accuracy under its own label, not among the P/R figures', async () => {
    await renderHome();
    // Its own label. The compromise readout says "Detector accuracy"; a category
    // accuracy sitting under that heading would be read as part of the same
    // number, which is exactly the conflation this screen must not commit.
    const block = screen.getByRole('group', { name: /category classification/i });
    expect(
      within(block).getByText(MEASURED_CLASSIFICATION.accuracy.toFixed(2)),
    ).toBeInTheDocument();
    // And the P/R figures are NOT inside it.
    expect(within(block).queryByText(/precision/i)).not.toBeInTheDocument();
    expect(within(block).queryByText(/recall/i)).not.toBeInTheDocument();
  });

  it('renders the classification provenance line verbatim, beside its own figure', async () => {
    await renderHome();
    const block = screen.getByRole('group', { name: /category classification/i });
    expect(within(block).getByText(MEASURED_CLASSIFICATION_PROVENANCE)).toBeInTheDocument();
    // The two provenance lines are both present and remain distinct.
    expect(screen.getByText(/^measured ·/)).toBeInTheDocument();
    expect(screen.getByText(/^category accuracy ·/)).toBeInTheDocument();
  });

  it('never presents the classification figure as precision or recall', async () => {
    await renderHome();
    const chip = screen.getByText(/^category accuracy ·/);
    expect(chip.textContent).not.toMatch(/precision|recall/i);
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
    const offending = run.trace.steps[idx - 1]!;
    // The offending step is whatever the RECORDED verdict anchored: for the ASI06
    // sample that is a memory_write, not a tool call, so the label comes from the
    // shared helper rather than assuming a tool name exists.
    const tool = offendingStepLabel(offending);

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
