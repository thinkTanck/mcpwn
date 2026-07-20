import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FindingsPage from '@/app/(hud)/findings/[id]/page';
import { FindingsReport } from '@/components/findings';
import { SAMPLE_RUN_ID } from '@/data/source';
import type { FixReport } from '@/data/source';

/**
 * A report whose fields are all DISTINCT from the sample's and from any literal
 * that might get hard-coded (RG-0472 / ASI06). If the screen renders these, the
 * header line is bound from the report, not baked into the markup.
 */
const customReport: FixReport = {
  runId: 'zzz-run-9999',
  category: 'ASI02',
  severity: 'Critical',
  compromised: true,
  stepId: 'zzz-s07',
  title: 'Tool misuse via crafted argument',
  offendingStep: {
    label: '#7 · tool_call run_shell',
    lines: [
      ['cmd', 'rm -rf /'],
      ['cwd', '/srv/app'],
    ],
  },
  impact: 'Arbitrary shell command executed on the host with the agent service account.',
  rootCause: 'The agent passed unvalidated user text straight into a shell tool argument.',
  remediation: [
    'Validate and allowlist every shell command argument before dispatch.',
    'Run tools under a least-privilege sandbox with no host filesystem access.',
    'Require confirmation for any destructive tool invocation.',
  ],
  rationale: 'The agent forwarded attacker-controlled text into an executable tool call.',
};

async function renderPage(id: string) {
  return render(await FindingsPage({ params: Promise.resolve({ id }) }));
}

describe('Findings / fix report screen', () => {
  it('has a single h1 (the report title) and non-skipping heading order', async () => {
    render(<FindingsReport report={customReport} />);
    const h1s = screen.getAllByRole('heading', { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent(customReport.title);
    // No heading skips a level: the section headings are h2 under the single h1.
    const levels = screen.getAllByRole('heading').map((h) => Number(h.tagName.slice(1)));
    for (let i = 1; i < levels.length; i += 1) {
      expect(levels[i]! - Math.max(...levels.slice(0, i))).toBeLessThanOrEqual(1);
    }
  });

  it('binds the header line (category · SEV severity · run id) from the report, not a literal', async () => {
    // Custom report: distinct values prove the markup is not hard-coded.
    render(<FindingsReport report={customReport} />);
    expect(screen.getByText('ASI02')).toBeInTheDocument();
    expect(screen.getByText('Critical')).toBeInTheDocument();
    expect(screen.getByText('zzz-run-9999')).toBeInTheDocument();
    // And no stale literal from the design mock leaked in.
    expect(screen.queryByText('RG-0472')).not.toBeInTheDocument();
  });

  it('renders the sample report through the DataSource with the sample run id', async () => {
    await renderPage('sample');
    expect(screen.getByText(SAMPLE_RUN_ID)).toBeInTheDocument();
    expect(screen.getByText('ASI06')).toBeInTheDocument();
    expect(screen.getByText('High')).toBeInTheDocument();
  });

  it('shows a COMPROMISED status chip with a text label (never color-only)', async () => {
    render(<FindingsReport report={customReport} />);
    expect(screen.getByText('COMPROMISED')).toBeInTheDocument();
  });

  it('renders remediation as an ordered list with one item per step', async () => {
    render(<FindingsReport report={customReport} />);
    const list = screen.getByRole('list', { name: /remediation/i });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(customReport.remediation.length);
    for (const step of customReport.remediation) {
      expect(within(list).getByText(step)).toBeInTheDocument();
    }
  });

  it('renders the offending step and its key/value payload lines', async () => {
    render(<FindingsReport report={customReport} />);
    expect(screen.getByText(customReport.offendingStep.label)).toBeInTheDocument();
    expect(screen.getByText('rm -rf /')).toBeInTheDocument();
  });

  it('copy button has an accessible name and shows COPIED feedback after activation', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    // Set up userEvent first (it installs its own clipboard stub), then override
    // with our spy so the assertion sees the component's real call.
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    render(<FindingsReport report={customReport} />);
    const button = screen.getByRole('button', { name: /copy report/i });
    expect(button).toBeInTheDocument();

    await user.click(button);
    expect(writeText).toHaveBeenCalledTimes(1);
    const copied = writeText.mock.calls[0]![0] as string;
    expect(copied).toContain(customReport.runId);
    expect(copied).toContain(customReport.title);
    expect(await screen.findByText(/copied/i)).toBeInTheDocument();
  });

  it('shows a labelled empty state with the id and a link back when the report is not found', async () => {
    await renderPage('no-such-run');
    expect(screen.getByText(/no report for run/i)).toBeInTheDocument();
    expect(screen.getByText('no-such-run')).toBeInTheDocument();
    expect(screen.getByRole('link')).toBeInTheDocument();
  });

  it('keeps the report copy em-dash free (locked rule; also carried into the copied ticket)', async () => {
    const { findingsFixture } = await import('@/data/fixtures/findings');
    const strings = [
      findingsFixture.title,
      findingsFixture.impact,
      findingsFixture.rootCause,
      findingsFixture.rationale,
      findingsFixture.offendingStep.label,
      ...findingsFixture.remediation,
    ];
    for (const s of strings) expect(s).not.toMatch(/—/);
  });
});
