import { render, screen } from '@testing-library/react';
import LeaderboardPage from '@/app/(hud)/leaderboard/page';
import { buildLeaderboard } from '@/leaderboard';
import { leaderboardFixtureRuns } from '@/data/fixtures/leaderboard';

/**
 * The leaderboard SCREEN over the real module 5 aggregator. The point of these
 * assertions is provenance, not decoration: every value on the board has to be
 * one the aggregator computed from run verdicts, and the board has to keep
 * saying out loud that those runs are fixtures (no per-model robustness has
 * been measured - plan.md B4).
 */
async function renderPage() {
  return render(await LeaderboardPage());
}

describe('Robustness leaderboard screen', () => {
  it('shows exactly the values the real aggregator computed from the fixture runs', async () => {
    const board = buildLeaderboard(leaderboardFixtureRuns());
    await renderPage();

    expect(board.models.length).toBeGreaterThan(0);
    for (const model of board.models) {
      for (const category of board.categories) {
        const cell = board.cells[model]?.[category];
        expect(cell).toBeDefined();
        const shown = cell?.robustness.toFixed(2) ?? '';
        const link = screen.getAllByRole('link', {
          name: (name) => name.startsWith(`${model} · ${category} `),
        });
        expect(link).toHaveLength(1);
        expect(link[0]).toHaveAccessibleName(new RegExp(`robustness ${shown},`));
      }
    }
  });

  it('renders one OVERALL per model, run-weighted by the aggregator', async () => {
    const board = buildLeaderboard(leaderboardFixtureRuns());
    const { container } = await renderPage();
    const overalls = [...container.querySelectorAll('tbody tr > td:last-child')].map((td) =>
      td.textContent?.trim(),
    );
    expect(overalls).toEqual(board.models.map((m) => board.byModel[m]?.robustness.toFixed(2)));
  });

  it('keeps the provenance visible: the board says its source is a fixture', async () => {
    await renderPage();
    expect(screen.getByText(/SOURCE · fixture/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    const intro = screen.getByText(/fixture/i, { selector: 'p' });
    expect(intro).toHaveTextContent(/not a claimed benchmark/i);
  });
});
