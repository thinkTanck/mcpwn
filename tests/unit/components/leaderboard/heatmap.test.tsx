import { render, screen, within } from '@testing-library/react';
import { LeaderboardHeatmap } from '@/components/leaderboard';
import type { BoardProvenance, Leaderboard, LeaderboardCell } from '@/data/source';

/**
 * The heatmap must be GENERIC over `categories.length` (the Core-7 makes it 7)
 * and it must never let one cell state pass for another. Three states, and the
 * tests below hold each one to a visible, non-colour channel:
 *
 *   MEASURED - the value plus its run count.
 *   FIXTURE  - the value, no run count, "fixture data" in the accessible name.
 *   NO DATA  - the words "No data", never a 0.00 and never breach red.
 */
const cell = (
  model: string,
  category: string,
  robustness: number,
  state: BoardProvenance = 'fixture',
  runs = 25,
): LeaderboardCell => ({ model, category, state, robustness, runs });

const noData = (model: string, category: string): LeaderboardCell => ({
  model,
  category,
  state: 'none',
  robustness: null,
  runs: 0,
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
  runs: 350,
  categories: CATS,
  rows: [
    {
      model: 'M1',
      overall: 0.62,
      runs: 175,
      state: 'fixture',
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
      runs: 175,
      state: 'fixture',
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

/** A measured board with one covered category and six untouched ones. */
const measuredMock: Leaderboard = {
  source: 'measured',
  runs: 4,
  categories: CATS,
  rows: [
    {
      model: 'agent-under-test',
      overall: 0.25,
      runs: 4,
      state: 'measured',
      cells: [
        cell('agent-under-test', 'ASI01', 0.25, 'measured', 4),
        ...CATS.slice(1).map((c) => noData('agent-under-test', c.id)),
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
      drillIn={{ runIdByCategory: runIds, fallbackRunId: 'sample-run' }}
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
    // Cell drill-ins live inside the scroll region; the focal "weakest" callout and
    // the "category names" link sit outside it, so scope the count to the region.
    const region = screen.getByRole('region', { name: /heatmap/i });
    expect(within(region).getAllByRole('link')).toHaveLength(2 * CATS.length);
  });

  it('surfaces the single weakest cell as a focal callout that links to its run', () => {
    renderHeatmap();
    // Anchored at the start: a cell link also mentions "the weakest cell", and
    // the callout is the one whose whole name begins with the label.
    expect(
      screen.getByRole('link', { name: /^Weakest fixture cell:.*Open run/i }),
    ).toBeInTheDocument();
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
        drillIn={{ runIdByCategory: {}, fallbackRunId: 'sample-run' }}
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

  it('labels a fixture board as a fixture, in the readout AND in every cell', () => {
    renderHeatmap();
    expect(screen.getByText(/source\s*·\s*fixture/i)).toBeInTheDocument();
    expect(screen.getByText(/not a claimed benchmark/i)).toBeInTheDocument();
    // Every scored cell repeats it, so provenance travels with the value rather
    // than sitting in a chip a screen-reader user has to go and find.
    const region = screen.getByRole('region', { name: /heatmap/i });
    for (const link of within(region).getAllByRole('link')) {
      expect(link).toHaveAccessibleName(/fixture data/i);
    }
  });

  it('never dresses a fixture cell as a measured one: no run count, no breach glow', () => {
    const { container } = renderHeatmap();
    expect(screen.queryByText(/^n=/)).not.toBeInTheDocument();
    expect(container.querySelector('.shadow-glow-breach')).toBeNull();
  });

  it('provides a keyboard-operable, labelled scroll region with a swipe affordance', () => {
    renderHeatmap();
    const region = screen.getByRole('region', { name: /heatmap/i });
    expect(region).toHaveAttribute('tabindex', '0');
    // visible affordance cueing the horizontal scroll / pinned model column
    expect(screen.getByText(/model column stays pinned/i)).toBeInTheDocument();
  });

  describe('a MEASURED board', () => {
    it('says measured, states each run count, and links no run it cannot serve', () => {
      const { container } = render(<LeaderboardHeatmap leaderboard={measuredMock} />);
      expect(screen.getByText(/source\s*·\s*measured/i)).toBeInTheDocument();
      expect(screen.getByText('n=4')).toBeInTheDocument();
      const region = screen.getByRole('region', { name: /measured .*heatmap/i });
      expect(within(region).queryAllByRole('link')).toHaveLength(0);
      // The scored cell still names its value, band and sample size in text.
      expect(
        within(region).getByText(/agent-under-test.*ASI01.*0\.25.*BREACH.*measured over 4 runs/),
      ).toBeInTheDocument();
      expect(container.querySelector('[data-cell-state="measured"]')).toBeInTheDocument();
    });

    it('renders an uncovered pair as NO DATA, never as 0.00 and never in breach red', () => {
      const { container } = render(<LeaderboardHeatmap leaderboard={measuredMock} />);
      const blanks = container.querySelectorAll('[data-cell-state="none"]');
      expect(blanks).toHaveLength(CATS.length - 1);
      // Six blank cells + the legend entry, all reading the same words.
      expect(screen.getAllByText(/no data/i).length).toBeGreaterThanOrEqual(CATS.length - 1);
      // No blank has been formatted into a score.
      expect(screen.queryByText('0.00')).not.toBeInTheDocument();
      for (const blank of blanks) {
        expect(blank.className).not.toMatch(/breach/);
      }
    });

    it('keeps the reserved breach glow for a measured weakest cell', () => {
      const { container } = render(<LeaderboardHeatmap leaderboard={measuredMock} />);
      expect(container.querySelector('.shadow-glow-breach')).not.toBeNull();
    });
  });
});
