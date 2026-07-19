import { render, screen, within } from '@testing-library/react';
import { LeaderboardHeatmap } from '@/components/leaderboard';
import type { Leaderboard, LeaderboardCell } from '@/data/source';

/**
 * The heatmap must be GENERIC over `categories.length`. Wave C ships the Core-7,
 * so this mock supplies SEVEN categories (the fixture in the repo currently has
 * five; the integrator expands it). Proving 7 columns here proves N columns.
 */
const cell = (model: string, category: string, robustness: number): LeaderboardCell => ({
  model,
  category,
  robustness,
});

const CATS = [
  { id: 'ASI01', full: 'Agent Goal Hijack' },
  { id: 'ASI02', full: 'Tool Misuse and Exploitation' },
  { id: 'ASI03', full: 'Identity and Privilege Abuse' },
  { id: 'ASI04', full: 'Agentic Supply Chain Vulnerabilities' },
  { id: 'ASI05', full: 'Unexpected Code Execution' },
  { id: 'ASI06', full: 'Memory & Context Poisoning' },
  { id: 'ASI10', full: 'Rogue Agents' },
];

const sevenColMock: Leaderboard = {
  source: 'fixture',
  categories: CATS,
  rows: [
    {
      model: 'M1',
      overall: 0.62,
      cells: [
        cell('M1', 'ASI01', 0.91), // nominal
        cell('M1', 'ASI02', 0.78), // caution
        cell('M1', 'ASI03', 0.4), // breach
        cell('M1', 'ASI04', 0.55),
        cell('M1', 'ASI05', 0.83),
        cell('M1', 'ASI06', 0.34),
        cell('M1', 'ASI10', 0.69),
      ],
    },
    {
      model: 'M2',
      overall: 0.71,
      cells: [
        cell('M2', 'ASI01', 0.88),
        cell('M2', 'ASI02', 0.6),
        cell('M2', 'ASI03', 0.72),
        cell('M2', 'ASI04', 0.49),
        cell('M2', 'ASI05', 0.9),
        cell('M2', 'ASI06', 0.51),
        cell('M2', 'ASI10', 0.81),
      ],
    },
  ],
};

const runIds: Record<string, string> = {
  ASI01: 'run01',
  ASI02: 'run02',
  ASI03: 'run03',
  ASI04: 'run04',
  ASI05: 'run05',
  ASI06: 'run06',
  ASI10: 'run10',
};

function renderHeatmap() {
  return render(
    <LeaderboardHeatmap
      leaderboard={sevenColMock}
      runIdByCategory={runIds}
      fallbackRunId="sample-run"
    />,
  );
}

describe('LeaderboardHeatmap', () => {
  it('renders one column header per category (7 here — generic over categories.length)', () => {
    renderHeatmap();
    for (const c of CATS) {
      expect(screen.getByRole('columnheader', { name: new RegExp(c.id) })).toBeInTheDocument();
    }
    // MODEL + 7 categories + OVERALL = 9 column headers.
    expect(screen.getAllByRole('columnheader')).toHaveLength(CATS.length + 2);
    expect(screen.getByRole('columnheader', { name: /overall/i })).toBeInTheDocument();
  });

  it('produces exactly models × categories drill-in cells (2 × 7 = 14)', () => {
    renderHeatmap();
    // Cell drill-ins live inside the scroll region; the separate focal "weakest"
    // callout sits outside it, so scope the count to the region.
    const region = screen.getByRole('region', { name: /heatmap/i });
    expect(within(region).getAllByRole('link')).toHaveLength(2 * CATS.length);
  });

  it('surfaces the single weakest cell as a focal callout that links to its run', () => {
    renderHeatmap();
    const weakest = screen.getByRole('link', { name: /Weakest:.*Open run/i });
    expect(weakest).toBeInTheDocument();
  });

  it('makes each cell the value-as-hero and names its band in text (never color-only)', () => {
    renderHeatmap();
    // breach cell M1 × ASI03 = 0.40
    const breach = screen.getByRole('link', { name: /M1.*ASI03.*0\.40.*BREACH/ });
    expect(within(breach).getByText('0.40')).toBeInTheDocument();
    // shape code present as a decorative glyph (distinguishable without colour)
    expect(breach.querySelector('svg[aria-hidden="true"]')).toBeInTheDocument();

    // nominal + caution bands are also named in text, not colour alone
    expect(screen.getByRole('link', { name: /M1.*ASI01.*0\.91.*NOMINAL/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /M1.*ASI02.*0\.78.*CAUTION/ })).toBeInTheDocument();
  });

  it('drills each cell into its run replay via a DataSource run id (not a literal)', () => {
    renderHeatmap();
    expect(screen.getByRole('link', { name: /M1.*ASI03/ })).toHaveAttribute('href', '/runs/run03');
    expect(screen.getByRole('link', { name: /M2.*ASI10/ })).toHaveAttribute('href', '/runs/run10');
  });

  it('falls back to the DataSource sample run id when a category has no mapped run', () => {
    render(
      <LeaderboardHeatmap
        leaderboard={sevenColMock}
        runIdByCategory={{}}
        fallbackRunId="sample-run"
      />,
    );
    expect(screen.getByRole('link', { name: /M1.*ASI01/ })).toHaveAttribute(
      'href',
      '/runs/sample-run',
    );
  });

  it('renders the per-row OVERALL magnitude', () => {
    renderHeatmap();
    expect(screen.getByText('0.62')).toBeInTheDocument();
    expect(screen.getByText('0.71')).toBeInTheDocument();
  });

  it('exposes a sticky model column (2-D heatmap horizontal-scroll pattern)', () => {
    const { container } = renderHeatmap();
    const sticky = container.querySelectorAll('[data-sticky="model"]');
    // one MODEL header + one per model row
    expect(sticky.length).toBe(1 + sevenColMock.rows.length);
    expect(container.querySelector('th[data-sticky="model"]')).toBeInTheDocument();
  });

  it('labels the data provenance honestly as a fixture (not a claimed benchmark)', () => {
    renderHeatmap();
    // the provenance chip names the source as a fixture, and the caption states
    // plainly that it is not a claimed benchmark
    expect(screen.getByText(/source\s*·\s*fixture/i)).toBeInTheDocument();
    expect(screen.getByText(/not a claimed benchmark/i)).toBeInTheDocument();
  });

  it('provides a keyboard-operable, labelled scroll region with a swipe affordance', () => {
    renderHeatmap();
    const region = screen.getByRole('region', { name: /heatmap/i });
    expect(region).toHaveAttribute('tabindex', '0');
    // visible affordance cueing the horizontal scroll / pinned model column
    expect(screen.getByText(/model column stays pinned/i)).toBeInTheDocument();
  });
});
